import type { Page } from '@playwright/test';

/**
 * Wait for N rendered frames of the page (requestAnimationFrame), returning the
 * elapsed page time. Used for retry backoff: the thing we wait for is the UI
 * finishing re-renders, so we count frames instead of wall-clock milliseconds.
 */
export function waitFrames(page: Page, frames: number): Promise<number> {
  return page.evaluate(
    (n) =>
      new Promise<number>((resolve) => {
        const start = performance.now();
        let left = Math.max(1, n);
        const step = () => {
          left -= 1;
          if (left <= 0) resolve(performance.now() - start);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}
