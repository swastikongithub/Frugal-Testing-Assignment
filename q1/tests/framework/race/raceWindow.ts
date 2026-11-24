import type { ElementHandle, Page } from '@playwright/test';
import type { TapRecord } from '../../../src/lib/telemetry';
import { CanvasCoordinateMismatchError } from '../resilience/errors';

export interface GateInfo {
  cycle: number;
  hiddenAt: number;
  paintSettledAt: number;
  openedAt: number;
  lastTapId: number;
}

/**
 * Resolves on the first animation frame where the skeleton of a *new* cycle is
 * gone, its removal has been painted (paint-settled flag), at least minDelayMs
 * of page time has passed since then, and the target canvas exists. Returns the
 * canvas element; gate timings are stashed in window.__raceGate and read after
 * the tap so no extra round trip sits between the gate and the gesture.
 */
export async function waitForRaceWindow(
  page: Page,
  options: { afterCycle: number; symbol: string; minDelayMs: number },
): Promise<ElementHandle<HTMLCanvasElement>> {
  const handle = await page.waitForFunction(
    ({ afterCycle, symbol, minDelayMs }) => {
      const t = window.__telemetry;
      const cycle = t.skeleton[t.skeleton.length - 1];
      if (!cycle || cycle.cycle < afterCycle || cycle.hiddenAt == null || cycle.paintSettledAt == null) return false;
      if (performance.now() - cycle.paintSettledAt < minDelayMs) return false;
      const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-zone="action-panel:${symbol}"]`);
      if (!canvas) return false;
      (window as unknown as { __raceGate: unknown }).__raceGate = {
        cycle: cycle.cycle,
        hiddenAt: cycle.hiddenAt,
        paintSettledAt: cycle.paintSettledAt,
        openedAt: performance.now(),
        lastTapId: t.taps[t.taps.length - 1]?.id ?? 0,
      };
      return canvas;
    },
    options,
    { polling: 'raf', timeout: 30_000 },
  );
  const element = handle.asElement();
  if (!element) throw new Error('race gate did not return an element');
  return element as ElementHandle<HTMLCanvasElement>;
}

/** After the gesture: the gate timings plus every tap the page logged since the gate opened. */
export async function readGateAndTaps(page: Page, expectedTaps: number): Promise<{ gate: GateInfo; taps: TapRecord[] }> {
  const handle = await page.waitForFunction(
    (count) => {
      const gate = (window as unknown as { __raceGate: GateInfo }).__raceGate;
      const taps = window.__telemetry.taps.filter((t) => t.id > gate.lastTapId);
      return taps.length >= count ? { gate, taps } : false;
    },
    expectedTaps,
    { polling: 'raf', timeout: 5_000 },
  );
  return (await handle.jsonValue()) as { gate: GateInfo; taps: TapRecord[] };
}

export async function lastTapId(page: Page): Promise<number> {
  return page.evaluate(() => window.__telemetry.taps[window.__telemetry.taps.length - 1]?.id ?? 0);
}

export async function nextTap(page: Page, afterId: number): Promise<TapRecord> {
  const handle = await page.waitForFunction(
    (id) => window.__telemetry.taps.find((t) => t.id > id) ?? false,
    afterId,
    { polling: 'raf', timeout: 5_000 },
  );
  return (await handle.jsonValue()) as TapRecord;
}

/** The app's own hit test is the source of truth for where a canvas tap landed. */
export function assertTapHit(tap: TapRecord, symbol: string, zone: 'BUY' | 'SELL'): void {
  const expected = `action-panel:${symbol}/${zone}`;
  const actual = `${tap.target}${tap.hitZone ? `/${tap.hitZone}` : ''}`;
  if (actual !== expected) throw new CanvasCoordinateMismatchError(expected, actual, { x: tap.x, y: tap.y });
}

/** CSS size of the action panel canvas (fixed in styles.css). */
export const PANEL_SIZE = { width: 236, height: 56 };

/** Centre of the BUY half of the action panel, relative to the canvas. */
export const buyPoint = (box: { width: number; height: number }) => ({ x: box.width / 4, y: box.height / 2 });
