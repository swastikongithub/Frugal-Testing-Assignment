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
    const captured = (window as unknown as Record<symbol, WeakMap<Element, ShadowRoot>>)[Symbol.for('shadow-pierce.roots')];
    const roots: ShadowRoot[] = [];
    const scopes: (Document | ShadowRoot)[] = [document];
    while (scopes.length) {
      const walker = document.createTreeWalker(scopes.shift() as Document | ShadowRoot, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const root = (node as Element).shadowRoot ?? captured?.get(node as Element);
        if (root) {
          roots.push(root);
          scopes.push(root);
        }
      }
    }
    return document.body.getHTML({ shadowRoots: roots });
  });

  const component = body
    .replace(/<script\b[^>]*><\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  const closedRoots = (component.match(/shadowrootmode="closed"/g) ?? []).length;
  const openRoots = (component.match(/shadowrootmode="open"/g) ?? []).length;
  if (closedRoots !== 1 || openRoots !== 1) throw new Error(`expected 1 open + 1 closed root, got ${openRoots} + ${closedRoots}`);

  const html = `<!-- One live load of the account micro-frontend, captured by "npm run snapshot". Shadow roots are serialised as declarative <template shadowrootmode> children of their hosts. -->\n<body>\n${component}\n</body>\n`;
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
  console.log(`captured ${openRoots} open + ${closedRoots} closed shadow root(s), ${html.length} chars`);
  console.log(`wrote prompt/examples/input-component.html and prompt/examples/user-message.txt`);
} finally {
  await browser.close();
  server.close();
}
