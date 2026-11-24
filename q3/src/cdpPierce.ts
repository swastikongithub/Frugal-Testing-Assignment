import type { CDPSession, Page } from '@playwright/test';

/**
 * The hook-free alternative to shadow-pierce.js: Chrome DevTools Protocol.
 *
 * Page JS cannot reach an unlinked closed shadow root, but the browser itself can. CDP sees
 * the whole flat tree without any script injected into the page:
 *
 *  - DOM.getDocument({ depth: -1, pierce: true }) returns every shadow root, each tagged with
 *    shadowRootType 'open' | 'closed' | 'user-agent', and every iframe's contentDocument. We use it
 *    to map the boundaries (shadow roots and frames) and to say where a matched node lives.
 *  - Accessibility.queryAXTree({ backendNodeId: <document>, role, accessibleName }) searches the
 *    accessibility tree, which is built from the flat tree, so closed roots are included. It stays
 *    inside one document, so it is asked once per document: the top one and each iframe's. The
 *    browser computes role and name itself (full accname, not a subset).
 *  - Acting uses real input: DOM.focus + keyboard for typing, DOM.getContentQuads + mouse for
 *    clicks. Reading uses DOM.resolveNode + Runtime.callFunctionOn on the remote object.
 *
 * Chromium only (CDP), and the session must be opened per page.
 */

/** The subset of CDP's DOM.Node this module reads. */
interface DomNode {
  backendNodeId: number;
  nodeName: string;
  localName: string;
  children?: DomNode[];
  shadowRoots?: DomNode[];
  shadowRootType?: string;
  contentDocument?: DomNode;
}

/** A boundary between tree scopes: an open or closed shadow root, or an iframe's document. */
export type Boundary = 'open' | 'closed' | 'frame';

export interface ScopeBoundary {
  /** Host (or iframe) tag name as found in this load (evidence only, never used to query). */
  hostName: string;
  mode: Boundary;
  /** Boundaries enclosing this host, outermost first ([] = host is in the top document). */
  enclosedBy: Boundary[];
}

export interface CdpMatch {
  backendNodeId: number;
  role: string;
  name: string;
  /** Boundaries around the node, outermost first ([] = in the top document). */
  chain: Boundary[];
}

export class CdpPierce {
  private constructor(
    private readonly page: Page,
    private readonly session: CDPSession,
  ) {}

  static async attach(page: Page): Promise<CdpPierce> {
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('Accessibility.enable');
    return new CdpPierce(page, session);
  }

  private async documentTree(): Promise<DomNode> {
    const { root } = await this.session.send('DOM.getDocument', { depth: -1, pierce: true });
    return root;
  }

  /**
   * Walks the pierced DOM once. Records every author shadow root and iframe document, each node's
   * enclosing boundaries, and every document (the top one and each iframe's) for queryAXTree.
   */
  private async index(): Promise<{ boundaries: ScopeBoundary[]; chainOf: Map<number, Boundary[]>; documents: number[] }> {
    const boundaries: ScopeBoundary[] = [];
    const chainOf = new Map<number, Boundary[]>();
    const documents: number[] = [];
    const visit = (node: DomNode, chain: Boundary[]): void => {
      chainOf.set(node.backendNodeId, chain);
      if (node.nodeName === '#document') documents.push(node.backendNodeId);
      for (const shadow of node.shadowRoots ?? []) {
        const mode = shadow.shadowRootType;
        if (mode === 'open' || mode === 'closed') {
          boundaries.push({ hostName: node.localName, mode, enclosedBy: chain });
          visit(shadow, [...chain, mode]);
        }
        // user-agent roots (inside <input>, <select>, ...) are browser internals: skipped.
      }
      for (const child of node.children ?? []) visit(child, chain);
      if (node.contentDocument) {
        boundaries.push({ hostName: node.localName, mode: 'frame', enclosedBy: chain });
        visit(node.contentDocument, [...chain, 'frame']);
      }
    };
    visit(await this.documentTree(), []);
    return { boundaries, chainOf, documents };
  }

  /** Every open and closed shadow root and every iframe document, as DOM.getDocument(pierce) reports them. */
  async boundaries(): Promise<ScopeBoundary[]> {
    return (await this.index()).boundaries;
  }

  /** Accessibility-tree search by role and (exact) accessible name, in the top document and every iframe document. */
  async queryAll(role: string, name?: string): Promise<CdpMatch[]> {
    const { chainOf, documents } = await this.index();
    const matches = new Map<number, CdpMatch>();
    for (const backendNodeId of documents) {
      const { nodes } = await this.session.send('Accessibility.queryAXTree', {
        backendNodeId,
        role,
        ...(name === undefined ? {} : { accessibleName: name }),
      });
      for (const node of nodes) {
        if (node.ignored || node.backendDOMNodeId === undefined) continue;
        matches.set(node.backendDOMNodeId, {
          backendNodeId: node.backendDOMNodeId,
          role: String(node.role?.value ?? ''),
          name: String(node.name?.value ?? ''),
          chain: chainOf.get(node.backendDOMNodeId) ?? [],
        });
      }
    }
    return [...matches.values()];
  }

  /** Exactly one match, or a descriptive error. */
  async queryOne(role: string, name?: string): Promise<CdpMatch> {
    const matches = await this.queryAll(role, name);
    if (matches.length !== 1) {
      throw new Error(`CDP: expected 1 ${role} "${name ?? '*'}" in the accessibility tree, found ${matches.length}`);
    }
    return matches[0] as CdpMatch;
  }

  /** Real mouse click at the centre of the node's first content quad (page coordinates, also for iframe content). */
  async click(match: CdpMatch): Promise<void> {
    await this.session.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: match.backendNodeId });
    const { quads } = await this.session.send('DOM.getContentQuads', { backendNodeId: match.backendNodeId });
    const quad = quads[0];
    if (!quad || quad.length < 8) throw new Error(`CDP: node ${match.backendNodeId} has no layout box`);
    const xs = [quad[0], quad[2], quad[4], quad[6]] as number[];
    const ys = [quad[1], quad[3], quad[5], quad[7]] as number[];
    await this.page.mouse.click(xs.reduce((a, b) => a + b) / 4, ys.reduce((a, b) => a + b) / 4);
  }

  /** Focus through CDP, then type with real key events. */
  async type(match: CdpMatch, text: string): Promise<void> {
    await this.session.send('DOM.focus', { backendNodeId: match.backendNodeId });
    await this.page.keyboard.type(text);
  }

  /** Runs `functionDeclaration` with `this` bound to the node (via its remote object) and returns the value. */
  async callOn<T>(match: CdpMatch, functionDeclaration: string, ...args: (string | number | boolean)[]): Promise<T> {
    const { object } = await this.session.send('DOM.resolveNode', { backendNodeId: match.backendNodeId });
    if (!object.objectId) throw new Error(`CDP: node ${match.backendNodeId} could not be resolved`);
    const { result, exceptionDetails } = await this.session.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      returnByValue: true,
    });
    await this.session.send('Runtime.releaseObject', { objectId: object.objectId });
    if (exceptionDetails) throw new Error(`CDP: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    return result.value as T;
  }

  /** Normalised text content of the node. */
  async text(match: CdpMatch): Promise<string> {
    return this.callOn<string>(match, 'function () { return this.textContent.replace(/\\s+/g, " ").trim(); }');
  }

  async detach(): Promise<void> {
    await this.session.detach();
  }
}
