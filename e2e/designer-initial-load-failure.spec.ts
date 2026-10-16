import { expect, test } from '@playwright/test';

for (const preset of [
  { id: 'blank-canvas-template', asset: 'BlankCanvasStandardData', empty: true },
  { id: 'enterprise-architecture-v2', asset: 'ArchitectureStandardData', empty: false },
]) test(`failed ${preset.id} loading stays unsavable and recovers only after explicit retry`, async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  let requests = 0;
  let allowLoad = false;
  await page.route(new RegExp(`/assets/${preset.asset}-[^/]+\\.json`), async route => {
    requests += 1;
    if (allowLoad) await route.continue();
    else await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  const id = preset.id;
  const readReady = () => page.evaluate(id => {
    const state = window as Window & { __flowDataBridge?: Record<string, { isCanvasReady?: () => boolean }> };
    return state.__flowDataBridge?.[id]?.isCanvasReady?.();
  }, id);
  await page.goto(`/#/?diagram=${id}`);
  const retry = page.getByRole('button', { name: '重试', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('图表加载失败');
  await expect.poll(readReady).toBe(false);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('initial-load-failed.png'), fullPage: true });
  expect(requests).toBeGreaterThan(0);
  expect(await page.evaluate(id => localStorage.getItem(`flowchart-autosave-v2-${id}`), id)).toBeNull();
  allowLoad = true;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect.poll(readReady).toBe(true);
  if (preset.empty) await expect(page.locator('.react-flow__node')).toHaveCount(0);
  else await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('initial-load-recovered.png'), fullPage: true });
});
