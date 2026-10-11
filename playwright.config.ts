import { defineConfig } from '@playwright/test';

const port = Number(process.env.VIZLY_E2E_PORT ?? 5410);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid browser test server port');
const baseURL = `http://127.0.0.1:${port}`;
const buildDirectory = `dist/e2e-main-${process.pid}`;

export default defineConfig({
  testDir: './e2e',
  // Independent invocations must not remove another run's traces on startup.
  outputDir: `./test-results/run-${process.pid}`,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Collaboration tests intercept this transport and send protocol fixtures;
    // no production identity or live collaboration server is needed by CI.
    env: { VITE_YJS_WEBSOCKET_URL: 'ws://127.0.0.1:5422' },
    // Keep active user previews and other test invocations on their own assets.
    command: `npm run build -- --outDir ${buildDirectory} && npm run preview -- --outDir ${buildDirectory} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
