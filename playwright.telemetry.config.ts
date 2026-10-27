import { defineConfig } from '@playwright/test';
const port=Number(process.env.VIZLY_TELEMETRY_E2E_PORT ?? 5496);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Invalid telemetry test port');
const directory=`tmp/e2e-telemetry-${process.pid}`;
export default defineConfig({testDir:'./e2e-telemetry',outputDir:`test-results/telemetry-${process.pid}`,workers:1,timeout:60_000,
 expect:{timeout:30_000},reporter:'list',use:{baseURL:`http://127.0.0.1:${port}`,browserName:'chromium',reducedMotion:'reduce',
 launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH},trace:'off'},
 webServer:{env:{VITE_SUPABASE_URL:'',VITE_SUPABASE_ANON_KEY:'',VITE_YJS_WEBSOCKET_URL:'',VITE_TELEMETRY_ENABLED:'true',VITE_RELEASE_ID:'a'.repeat(40)},
 command:`npm run build -- --outDir ${directory} && npm run preview -- --outDir ${directory} --host 127.0.0.1 --port ${port} --strictPort`,
 url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:120_000}});
