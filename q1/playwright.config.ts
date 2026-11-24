import { defineConfig, devices } from '@playwright/test';

const PORT = 5317;
const VIEWPORT = { width: 1440, height: 900 };

export default defineConfig({
  testDir: './tests',
  // One worker: the tests measure timing windows, so they must not compete for CPU.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['./reporters/evidence-summary.ts']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    viewport: VIEWPORT,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: VIEWPORT } }],
  webServer: {
    // Builds the React bundle, then serves it plus the mock exchange (REST + WebSocket).
    command: 'npm run build && npm run serve',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
  },
});
