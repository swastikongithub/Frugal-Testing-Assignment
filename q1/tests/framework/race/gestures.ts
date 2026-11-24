import type { ElementHandle, Page } from '@playwright/test';
import type { Terminal } from '../terminal';
import { PANEL_SIZE, assertTapHit, buyPoint, lastTapId, nextTap } from './raceWindow';
import { toTypedError } from '../resilience/errors';

export type GestureName = 'triple-click' | 'interrupted-tap';

export interface GestureResult {
  /** Taps the browser actually dispatched to the page. */
  dispatched: number;
  /** Taps that never left Playwright because the element was already stale. */
  errors: Error[];
}

/**
 * triple-click: one native mouse burst (clickCount 3) at fixed coordinates.
 *   Tap 1 inserts the order strip above the panel, so taps 2-3 land on the strip
 *   -> canvas coordinate mismatch.
 * interrupted-tap: three taps through the same ElementHandle. Tap 1 re-mounts
 *   the row, so taps 2-3 hold a detached element -> stale element reference.
 */
export async function fireGesture(gesture: GestureName, page: Page, canvas: ElementHandle<HTMLCanvasElement>): Promise<GestureResult> {
  if (gesture === 'triple-click') {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('action panel has no box');
    const point = buyPoint(box);
    await page.mouse.click(box.x + point.x, box.y + point.y, { clickCount: 3 });
    return { dispatched: 3, errors: [] };
  }

  const result: GestureResult = { dispatched: 0, errors: [] };
  for (let tap = 1; tap <= 3; tap++) {
    try {
      await canvas.click({ force: true, position: buyPoint(PANEL_SIZE), timeout: 2_000 });
      result.dispatched += 1;
    } catch (err) {
      result.errors.push(toTypedError(`interrupted tap ${tap}`, err));
    }
  }
  return result;
}

/**
 * One recovery tap, always against a freshly resolved target (semantic locator),
 * verified by the app's hit report. Throws a typed error so the breaker can decide.
 */
export async function redeliverTap(gesture: GestureName, page: Page, terminal: Terminal, symbol: string): Promise<void> {
  const before = await lastTapId(page);
  const panel = terminal.actionPanel(symbol);

  if (gesture === 'triple-click') {
    const box = await panel.boundingBox();
    if (!box) throw new Error('action panel not rendered');
    const point = buyPoint(box);
    await page.mouse.click(box.x + point.x, box.y + point.y);
  } else {
    const handle = (await panel.elementHandle()) as ElementHandle<HTMLCanvasElement>;
    try {
      await handle.click({ force: true, position: buyPoint((await handle.boundingBox()) ?? PANEL_SIZE), timeout: 2_000 });
    } catch (err) {
      throw toTypedError('recovery tap', err);
    }
  }

  assertTapHit(await nextTap(page, before), symbol, 'BUY');
}
