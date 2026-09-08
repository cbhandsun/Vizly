import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import { readFile } from 'node:fs/promises';
import { parseViteModuleEntry } from './lib/bundle-static-import-graph.mjs';
import { waitForDisplayRoutingBrowserValue } from './lib/display-routing-browser-wait.mjs';
import { startupFaultCases, readStartupFaultRecovery, assertStartupFaultRecovery, parseStartupFaultBaseUrl } from './lib/startup-fault-cases.mjs';

const baseUrl = parseStartupFaultBaseUrl(process.env.PRECOMPILED_ROUTE_BASE_URL ?? 'http://127.0.0.1:4176');
const moduleEntry = parseViteModuleEntry(await readFile('dist/index.html', 'utf8'));
for (const fault of startupFaultCases) {
  try {
    await withPrecompiledRouteBrowser(async session => {
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: 1024, height: 768, deviceScaleFactor: 1, mobile: false,
      });
      if (fault.source) await session.send('Page.addScriptToEvaluateOnNewDocument', { source: fault.source });
      if (fault.blockEntry) {
        await session.send('Network.enable');
        await session.send('Network.setBlockedURLs', { urls: [new URL(moduleEntry, baseUrl).href] });
      }
      await session.send('Page.navigate', { url: new URL('/?diagram=logistics-architecture-v1', baseUrl).href });
      const result = await waitForDisplayRoutingBrowserValue(session,
        `(${readStartupFaultRecovery.toString()})(${JSON.stringify(fault.kind)})`,
        60_000, { diagnosticsExpression: 'null' });
      assertStartupFaultRecovery(result, fault);
    });
  } catch {
    throw new Error(`Startup fault verification failed: ${fault.id}`);
  }
  process.stdout.write(`Startup fault passed: ${fault.id}\n`);
}
