import { defineConfig } from '@playwright/test';
import main from './playwright.config.ts';

// Exercise the same production build and assertions on both secondary engines.
export default defineConfig(main, {
  testMatch: [
    'first-flowchart-node.spec.ts',
    'persisted-document-readonly.spec.ts',
    'export-downloads.spec.ts',
    'storage-and-recovery.spec.ts',
    'startup-locale-recovery.spec.ts',
  ],
  outputDir: `./test-results/compatibility-${process.pid}`,
  reporter: [['list'], ['html', { outputFolder: `playwright-report/compatibility-${process.pid}`, open: 'never' }]],
  use: { launchOptions: { executablePath: undefined } },
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
