import { defineConfig } from '@playwright/test';

const port = Number(process.env.VIZLY_RECOVERY_E2E_PORT ?? 5463);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid recovery browser test port');
const baseURL = `http://127.0.0.1:${port}`;
const buildDirectory = `tmp/e2e-recovery-${process.pid}`;

export default defineConfig({
  testDir: './e2e-recovery',
  outputDir: `./test-results/recovery-${process.pid}`,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL, browserName: 'chromium', reducedMotion: 'reduce',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    // A dedicated build cannot overwrite the user's preview or access live Supabase.
    env: {
      VITE_SUPABASE_URL: 'https://recovery-fixture.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_browser_fixture',
      VITE_YJS_WEBSOCKET_URL: 'ws://127.0.0.1:5432',
    },
    command: `npm run build -- --outDir ${buildDirectory} && npm run preview -- --outDir ${buildDirectory} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 120_000,
  },
});
