import { expect, test, type ElementHandle, type Frame, type Page } from '@playwright/test';
import { Evidence } from './framework/evidence';
import { inOwnFrame, loadDemo, RELOADS } from './framework/pierce';

/**
 * The iframe the brief nests in the closed root is also a way into that root, with no attachShadow hook:
 *
 *  1. window.frames does not list an iframe that lives in a shadow tree, so page JS in the top window
 *     cannot get at it. Playwright's frame tree can: it comes from the browser, not from the DOM.
 *  2. Code running in the iframe can call frameElement.getRootNode(). The iframe element sits in the
 *     closed root, so that returns the closed ShadowRoot itself. "closed" only hides host.shadowRoot.
 *
 * So the closed boundary keeps out scripts of the top window, but not scripts of a same-origin frame inside it.
 */

/** The frame whose document has the "Confirm Transaction" button, found by role, not by any selector. */
async function confirmationFrame(page: Page): Promise<Frame> {
  const found: Frame[] = [];
  for (const frame of page.frames()) {
    if (await frame.getByRole('button', { name: 'Confirm Transaction', exact: true }).count()) found.push(frame);
  }
  expect(found, 'exactly one frame holds the confirmation button').toHaveLength(1);
  return found[0] as Frame;
}

test.describe('Q3 - the nested iframe as a hook-free way into the closed root', () => {
  test(`Playwright's frame tree + frameElement.getRootNode() reach the closed root and drive the transfer on ${RELOADS} reloads`, async ({ page }, testInfo) => {
    const evidence = new Evidence(testInfo);
    const log = evidence.logger('frame-route');
    let reached = 0;
    let driven = 0;

    for (let load = 1; load <= RELOADS; load++) {
      await loadDemo(page);
      // Nothing was injected into the page: no hook, no deep query.
      expect(await page.evaluate(() => [typeof window.__shadowPierce, Symbol.for('shadow-pierce.roots') in window, window.length]))
        .toEqual(['undefined', false, 0]);

      const frame = await confirmationFrame(page);
      const root = await frame.evaluate(() => {
        const shadow = window.frameElement?.getRootNode() as ShadowRoot | undefined;
        return {
          mode: shadow?.mode ?? 'none',
          hostShadowRoot: shadow?.host.shadowRoot === null ? 'null' : 'exposed',
          hostTag: shadow?.host.localName ?? '',
        };
      });
      expect(root.mode, 'frameElement.getRootNode() is the closed root').toBe('closed');
      expect(root.hostShadowRoot, 'while host.shadowRoot stays null').toBe('null');
      reached++;

      // The amount field is in the closed root, next to the iframe: find it there by its label text.
      const inFrameContext = (await frame.evaluateHandle(() => {
        const shadow = window.frameElement?.getRootNode() as ShadowRoot;
        const walker = shadow.ownerDocument.createTreeWalker(shadow, NodeFilter.SHOW_ELEMENT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const labels = (node as HTMLInputElement).labels;
          if (labels && [...labels].some((label) => label.textContent?.trim() === 'Amount')) return node;
        }
        return null;
      })).asElement() as ElementHandle<Element> | null;
      expect(inFrameContext, 'the Amount field, reached from inside the iframe').not.toBeNull();
      const amount = (load * 33.3).toFixed(2);
      await (await inOwnFrame(inFrameContext!)).fill(amount); // the field lives in the top document

      await frame.getByRole('button', { name: 'Confirm Transaction', exact: true }).click();
      const expected = `Transfer of ${amount} to Savings 4821 scheduled.`;
      await expect(frame.getByRole('status')).toHaveText(expected);
      driven++;
      log(`load ${load}: frame tree -> iframe -> frameElement.getRootNode() = closed root of <${root.hostTag}> -> "${expected}"`);
    }

    evidence.metric('reloads', RELOADS);
    evidence.metric('hook or deep query injected', 'no');
    evidence.metric('window.frames lists the iframe', 'no (window.length 0)');
    evidence.metric('iframe found via Playwright frame tree (by role)', `${reached}/${RELOADS}`);
    evidence.metric('closed root via frameElement.getRootNode()', `${reached}/${RELOADS}`);
    evidence.metric('transfers driven this way', `${driven}/${RELOADS}`);
    await evidence.flush();
  });
});
