import { chromium, firefox, webkit } from 'playwright';
import { probeBrowserRuntimes } from './lib/ciBrowserRuntime.mjs';

const result = await probeBrowserRuntimes({ chromium, firefox, webkit });
process.stdout.write(JSON.stringify(result) + '\n');
if (result.status !== 'passed') process.exitCode = 1;
