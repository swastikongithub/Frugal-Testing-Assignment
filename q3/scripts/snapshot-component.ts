import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startServer } from './serve';

/**
 * Captures one live load of the micro-frontend as raw HTML for the locator prompt:
 *   prompt/examples/input-component.html   the component tree, shadow roots included
 *   prompt/examples/user-message.txt       the user message to send with the system prompt
 *
 * Shadow roots are serialised as declarative <template shadowrootmode="open|closed"> children
 * of their hosts (Element.getHTML with an explicit shadowRoots list). The closed root can only
 * be listed because shadow-pierce.js captured it at attachShadow time.
 *
 * getHTML() leaves an <iframe> empty, so each iframe's own document is serialised inside the
 * iframe element, after a "#document" line, the way DevTools (and the Q3 brief) show it.
 *
 * Every run writes new random tag names, ids and classes: that is the point.
 */
const out = (name: string): string => fileURLToPath(new URL(`../prompt/examples/${name}`, import.meta.url));
const PIERCE = fileURLToPath(new URL('../src/shadow-pierce.js', import.meta.url));

export const TARGETS = [
  ['securityTab', 'the "Security" tab of the account settings'],
  ['profilePanel', 'the panel shown for the "Profile" tab'],
  ['amountField', 'the transfer amount input'],
  ['destinationAccount', 'the destination account picker'],
  ['confirmTransfer', 'the button that submits the transfer'],
  ['transferStatus', 'the live message that reports the transfer result'],
] as const;

const { server, url } = await startServer(0);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addInitScript({ path: PIERCE });
  await page.goto(url);
  await page.getByRole('region', { name: 'Transfer funds', exact: true }).waitFor();

  // No named inner functions here: tsx (esbuild keepNames) would wrap them in a __name() helper
  // that does not exist in the page.
  const body = await page.evaluate(() => {
    const key = Symbol.for('shadow-pierce.roots');
    const roots: ShadowRoot[] = [];
    const frames: HTMLIFrameElement[] = [];
    const scopes: (Document | ShadowRoot)[] = [document];
    while (scopes.length) {
      const scope = scopes.shift() as Document | ShadowRoot;
      const walker = (scope.ownerDocument ?? (scope as Document)).createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node as Element;
        // Each frame has its own hook and its own map of captured roots.
        const captured = (el.ownerDocument.defaultView as unknown as Record<symbol, WeakMap<Element, ShadowRoot> | undefined>)[key];
        const root = el.shadowRoot ?? captured?.get(el);
        if (root) {
          roots.push(root);
          scopes.push(root);
        }
        if (el.tagName === 'IFRAME' && (el as HTMLIFrameElement).contentDocument) {
          frames.push(el as HTMLIFrameElement);
          scopes.push((el as HTMLIFrameElement).contentDocument as Document);
        }
      }
    }
    // Serialise every iframe's document, mark the iframe, serialise the page, then splice each document in.
    const documents = frames.map((frame, index) => {
      const doc = frame.contentDocument as Document;
      frame.setAttribute('data-snapshot-frame', String(index));
      return `#document\n<html lang="${doc.documentElement.lang}">\n<body>\n${doc.body.getHTML({ shadowRoots: roots })}\n</body>\n</html>`;
    });
    let html = document.body.getHTML({ shadowRoots: roots });
    documents.forEach((serialised, index) => {
      html = html.replace(new RegExp(`(<iframe\\b[^>]*?) data-snapshot-frame="${index}"([^>]*>)</iframe>`),
        (_match, open: string, rest: string) => `${open}${rest}\n${serialised}\n</iframe>`);
    });
    frames.forEach((frame) => frame.removeAttribute('data-snapshot-frame'));
    return html;
  });

  const component = body
    .replace(/<script\b[^>]*><\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  const closedRoots = (component.match(/shadowrootmode="closed"/g) ?? []).length;
  const openRoots = (component.match(/shadowrootmode="open"/g) ?? []).length;
  const frameDocuments = (component.match(/^#document$/gm) ?? []).length;
  if (closedRoots !== 1 || openRoots !== 1 || frameDocuments !== 1 || component.includes('data-snapshot-frame')) {
    throw new Error(`expected 1 open root, 1 closed root and 1 iframe document, got ${openRoots}, ${closedRoots} and ${frameDocuments}`);
  }

  const html = `<!-- One live load of the account micro-frontend, captured by "npm run snapshot". Shadow roots are serialised as declarative <template shadowrootmode> children of their hosts. An iframe's own document is serialised inside the iframe element, after a #document line. -->\n<body>\n${component}\n</body>\n`;
  const message = [
    'Build ARIA-only locator strategies for the component below.',
    '',
    'Targets (use these keys):',
    ...TARGETS.map(([key, intent]) => `- ${key}: ${intent}`),
    '',
    '<component>',
    html.trimEnd(),
    '</component>',
    '',
  ].join('\n');

  mkdirSync(out(''), { recursive: true });
  writeFileSync(out('input-component.html'), html);
  writeFileSync(out('user-message.txt'), message);
  console.log(`captured ${openRoots} open + ${closedRoots} closed shadow root(s) and ${frameDocuments} iframe document(s), ${html.length} chars`);
  console.log(`wrote prompt/examples/input-component.html and prompt/examples/user-message.txt`);
} finally {
  await browser.close();
  server.close();
}
