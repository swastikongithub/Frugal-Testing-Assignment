import type { Page } from '@playwright/test';

/**
 * Event-loop starvation: slows the renderer's main thread through CDP, so the
 * app has to process delayed, out-of-order frames while it is short of CPU.
 */
export async function throttleCpu(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return {
    rate,
    async release() {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.detach();
    },
  };
}
