import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type ElementHandle, type Page } from '@playwright/test';

/** Number of full page loads each piercing / locator test runs over (names change on every one). */
export const RELOADS = 5;

const fromRoot = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));

export const PIERCE_SCRIPT = fromRoot('src/shadow-pierce.js');
export const MIN_HOOK = readFileSync(fromRoot('src/pierce-hook.min.js'), 'utf8').trim();
export const MIN_QUERY = readFileSync(fromRoot('src/pierce-query.min.js'), 'utf8').trim();
export const README = fromRoot('README.md');

/** Role + accessible name query understood by window.__shadowPierce. */
export interface RoleQuery {
  role: string;
  name?: string;
  includeHidden?: boolean;
}

export interface RelationQuery {
  relation: string;
  direction: 'anchor-to-target' | 'target-to-anchor';
  anchor: { role: string; name?: string; text?: string };
  targetRole: string;
  includeHidden?: boolean;
}

interface ShadowPierceApi {
  query(q: RoleQuery & { within?: Node }): Element | null;
  queryAll(q: RoleQuery & { within?: Node }): Element[];
  queryPath(steps: RoleQuery[], options?: { includeHidden?: boolean }): Element[];
  queryRelation(q: RelationQuery): Element[];
  roleOf(el: Element): string | null;
  nameOf(el: Element): string;
  isHidden(el: Element): boolean;
  scopeOf(el: Element): { mode: 'document' | 'open' | 'closed' | 'frame'; chain: { mode: 'open' | 'closed' | 'frame'; hostTag: string }[] };
  landmarksOf(el: Element): { role: string; name: string }[];
  absolutePath(el: Element): string;
  idrefs(el: Element, attribute: string): Element[];
  text(el: Element): string;
  stats(): { open: number; closed: number; frames: number };
}

declare global {
  interface Window {
    __shadowPierce: ShadowPierceApi;
  }
}

/** Injects the attachShadow hook + deep query before any page script runs. */
export async function installPierce(page: Page): Promise<void> {
  await page.addInitScript({ path: PIERCE_SCRIPT });
}

/** Full navigation (a fresh document, so app.js regenerates every tag, id and class). */
export async function loadDemo(page: Page): Promise<void> {
  await page.goto('/');
  // The open shell is visible to Playwright, so this waits for the micro-frontend to mount.
  await expect(page.getByRole('region', { name: 'Transfer funds', exact: true })).toBeVisible();
}

/** Every match of the deep query, as element handles. */
export async function pierceAll(page: Page, query: RoleQuery): Promise<ElementHandle<Element>[]> {
  const list = await page.evaluateHandle((q) => window.__shadowPierce.queryAll(q), query);
  const properties = await list.getProperties();
  const handles = [...properties.values()].map((h) => h.asElement()).filter((h): h is ElementHandle<Element> => h !== null);
  await list.dispose();
  return handles;
}

/** Exactly one match of the deep query, or a failing assertion that says how many there were. */
export async function pierceOne(page: Page, query: RoleQuery): Promise<ElementHandle<Element>> {
  const handles = await pierceAll(page, query);
  expect(handles, `deep query ${JSON.stringify(query)} should match exactly one element`).toHaveLength(1);
  return handles[0] as ElementHandle<Element>;
}

/**
 * The same element, as a handle Playwright can act on (click, fill, boundingBox).
 *
 * The deep query runs in the top window and also returns elements from the iframe nested in the closed
 * root. Their handles belong to the top window's context, and Playwright computes boxes and hit targets
 * from the frame of that context, so a click on such a handle lands off target and times out. This hands
 * the element to the window of the document it lives in and takes it back through that frame, which
 * Playwright resolves from the node itself (ownerFrame), not from a selector.
 */
export async function inOwnFrame(handle: ElementHandle<Element>): Promise<ElementHandle<Element>> {
  const frame = await handle.ownerFrame();
  if (!frame) throw new Error('element is not attached to any frame');
  const key = '__shadowPierceHandoff';
  await handle.evaluate((el, k) => {
    (el.ownerDocument.defaultView as unknown as Record<string, Element>)[k] = el;
  }, key);
  const adopted = await frame.evaluateHandle((k) => {
    const bag = window as unknown as Record<string, Element>;
    const el = bag[k] as Element;
    delete bag[k];
    return el;
  }, key);
  return adopted.asElement() as ElementHandle<Element>;
}

/** true when two handles point at the same DOM node (both must come from the top window's context). */
export async function sameNode(page: Page, a: ElementHandle<Element>, b: ElementHandle<Element>): Promise<boolean> {
  return page.evaluate(([x, y]) => x === y, [a, b] as const);
}
