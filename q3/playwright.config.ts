import { defineConfig, devices } from '@playwright/test';

const PORT = 5318;

export default defineConfig({
  testDir: './tests',
  // One worker keeps the trace/video per test readable; the suite takes seconds anyway.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['./reporters/evidence-summary.ts']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
  // Chromium only: the CDP alternative (DOM.getDocument pierce, Accessibility.queryAXTree) is Chromium's protocol.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run serve',
    url: `http://127.0.0.1:${PORT}/health`,
    // The demo is a static server, so a copy you already started with `npm run serve` can be reused (not in CI).
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
  },
});
