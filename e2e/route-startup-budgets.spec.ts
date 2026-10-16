import { expect, test } from '@playwright/test';
import { collectRouteBudgetViolations, resolveRouteBudget } from '../scripts/lib/routeSmokeBudgets';

// Cold contexts, cache disabled, critical resource window ends at actual UI
// readiness. No extra post-ready delay is included in the startup budget.
for (const scenario of [
  { name: 'management', path: '/#/manage', selector: 'main[aria-label="工作区"]', mobile: false },
  { name: 'management', path: '/#/manage', selector: 'main[aria-label="工作区"]', mobile: true },
  { name: 'storage-config', path: '/#/storage-config', selector: '[data-smoke-ready="storage-config"]', mobile: false },
]) {
  test(`cold startup budget / ${scenario.name} / ${scenario.mobile ? 'mobile' : 'desktop'}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: scenario.mobile ? 390 : 1280, height: 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.name));
    await page.goto(scenario.path, { waitUntil: 'commit' });
    await expect(page.locator(scenario.selector).first()).toBeVisible();
    await expect(page.locator('script[type="module"][src*="/assets/"]')).toHaveCount(1);
    if (scenario.name === 'management') {
      await expect(page.locator('main .diagram-grid[role="status"]')).not.toBeVisible();
    }
    const readyMs = await page.evaluate(() => performance.now());
    // Read complete body sizes after settling, but freeze the critical window
    // at UI readiness. Match the original budget: unique /assets/ resources
    // whose requests STARTED before readiness, measured on the page clock.
    await page.waitForLoadState('networkidle');
    const report = await page.evaluate(readyAt => {
      const resources = new Map<string, PerformanceResourceTiming>();
      for (const resource of performance.getEntriesByType('resource')) {
        if (!(resource instanceof PerformanceResourceTiming) || !resource.name.includes('/assets/') || resource.startTime > readyAt) continue;
        const previous = resources.get(resource.name);
        if (!previous || previous.decodedBodySize < resource.decodedBodySize) resources.set(resource.name, resource);
      }
      return {
        readyMs: readyAt, criticalAssets: resources.size,
        criticalDecodedKB: [...resources.values()].reduce((sum, resource) => sum + resource.decodedBodySize, 0) / 1024,
        assets: [...resources.values()].map(resource => ({
          path: new URL(resource.name).pathname,
          decodedBytes: resource.decodedBodySize,
        })).sort((a, b) => b.decodedBytes - a.decodedBytes),
      };
    }, readyMs);
    // CI always uses checked-in defaults; developer overrides cannot green CI.
    const budget = resolveRouteBudget(scenario.name, { env: {}, isMobile: scenario.mobile });
    await testInfo.attach('startup metrics', { body: JSON.stringify({ scenario, report, budget }), contentType: 'application/json' });
    expect(report.criticalAssets).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    expect(collectRouteBudgetViolations(report, budget)).toEqual([]);
  });
}
