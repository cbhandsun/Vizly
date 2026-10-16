import { expect, test } from '@playwright/test';

type WorkerRecord = { path: string; messages: number; errors: number };
type ObservedWindow = Window & { __vizlyReleaseWorkers?: WorkerRecord[] };

for (const scenario of ['management', 'diagram', 'invalid-share'] as const) {
  test(`clean release resources / ${scenario}`, async ({ page, context }, testInfo) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'zh');
      const records: WorkerRecord[] = [];
      (window as ObservedWindow).__vizlyReleaseWorkers = records;
      window.Worker = new Proxy(window.Worker, {
        construct(Target, args: ConstructorParameters<typeof Worker>) {
          const worker = Reflect.construct(Target, args) as Worker;
          const record = { path: new URL(String(args[0]), location.href).pathname, messages: 0, errors: 0 };
          records.push(record);
          worker.addEventListener('message', () => { record.messages++; });
          worker.addEventListener('error', () => { record.errors++; });
          return worker;
        },
      });
    });
    const assets: { path: string; status: number }[] = [];
    const failures: string[] = [];
    const errors: string[] = [];
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/assets/')) assets.push({ path, status: response.status() });
    });
    page.on('requestfailed', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/assets/')) failures.push(path);
    });
    page.on('pageerror', error => errors.push(error.name));
    const route = scenario === 'management' ? '/#/manage'
      : scenario === 'diagram' ? '/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1'
        : '/#/shared';
    await page.goto(route);
    if (scenario === 'management') await expect(page.getByRole('main', { name: '工作区', exact: true })).toBeVisible();
    else if (scenario === 'invalid-share') await expect(page.getByText('分享链接无效或已过期', { exact: true })).toBeVisible();
    else {
      await expect(page.locator('.react-flow__node[data-id="order-import"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as ObservedWindow).__vizlyReleaseWorkers
        ?.filter(worker => worker.path.includes('baseReactFlowDisplayEdges.worker'))
        .reduce((total, worker) => total + worker.messages, 0) ?? 0)).toBeGreaterThan(0);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    const runtime = await page.evaluate(() => ({
      fonts: document.fonts.status,
      language: document.documentElement.lang,
      workers: (window as ObservedWindow).__vizlyReleaseWorkers ?? [],
      nodes: document.querySelectorAll('.react-flow__node').length,
      edges: document.querySelectorAll('.react-flow__edge').length,
    }));
    await testInfo.attach('release resources', {
      body: JSON.stringify({ scenario, assets, failures, errors, runtime }), contentType: 'application/json',
    });
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.filter(asset => asset.status !== 200)).toEqual([]);
    expect(assets.some(asset => /\/zh-[^/]+\.json$/.test(asset.path))).toBe(true);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    expect(runtime.fonts).toBe('loaded');
    expect(runtime.language).toBe('zh');
    expect(runtime.workers.filter(worker => worker.errors !== 0)).toEqual([]);
  });
}
