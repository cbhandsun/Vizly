import { defineConfig } from '@playwright/test';

const port = Number(process.env.VIZLY_S3_E2E_PORT ?? 5443);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid S3 browser server port');
const buildDirectory = `dist/e2e-s3-${process.pid}`;

export default defineConfig({
  testDir: './integration/browser',
  outputDir: `./test-results/s3-${process.pid}`,
  fullyParallel: false, workers: 1, timeout: 60_000,
  expect: { timeout: 30_000 },
  reporter: process.env.VIZLY_S3_BROWSER_REPORT ? [['json', { outputFile: process.env.VIZLY_S3_BROWSER_REPORT }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium', reducedMotion: 'reduce',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    // Disposable storage credentials must never enter authentication traces.
    trace: 'off', screenshot: 'off', video: 'off',
  },
  webServer: {
    command: `npm run build -- --outDir ${buildDirectory} && npm run preview -- --outDir ${buildDirectory} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120_000,
  },
});
