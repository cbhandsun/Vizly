import { expect, test } from '@playwright/test';
import { persistedAutoSaveNodeCount } from './helpers/localDiagramDatabase';

for (const width of [390, 621, 1280]) {
  test(`first rectangle waits safely for the advanced canvas chunk / ${width}px`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let advancedRequested = false;
    let releaseChunk: () => void = () => {};
    const chunkGate = new Promise<void>(resolve => { releaseChunk = resolve; });
    await page.route('**/assets/AdvancedFlowchartCanvasShell-*.js', async route => {
      advancedRequested = true;
      await chunkGate;
      await route.continue();
    });
    await page.setViewportSize({ width, height: width === 621 ? 641 : 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    try {
      await page.goto('/#/manage');
      await page.getByRole('button', { name: '新建流程图', exact: true }).click();
      await page.getByRole('button', { name: '选择第一个图形', exact: true }).click();
      const library = page.getByRole('dialog', { name: '基础形状', exact: true });
      await library.getByRole('button', { name: '矩形', exact: true }).click();
      await expect.poll(() => advancedRequested).toBe(true);
      await page.getByRole('button', { name: /^放大 \(/ }).click();
      await expect(page.getByText('渲染失败', { exact: true })).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    } finally {
      releaseChunk();
    }
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  });

  test(`first rectangle survives the empty-to-advanced canvas transition / ${width}px`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: width === 621 ? 641 : 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/#/manage');
    await page.getByRole('button', { name: '新建流程图', exact: true }).click();
    await page.getByRole('button', { name: '选择第一个图形', exact: true }).click();
    const library = page.getByRole('dialog', { name: '基础形状', exact: true });
    await library.getByRole('button', { name: '矩形', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.getByText('渲染失败', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重命名流程图', exact: true })).toBeVisible();
    const id = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('diagram');
    if (!id) throw new Error('Created diagram identity missing');
    // The caught render loop used to occur after the first node became visible,
    // before autosave. Wait for the durable canvas snapshot, then verify real restoration.
    await expect.poll(() => persistedAutoSaveNodeCount(page, id)).toBe(1);
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.getByText('渲染失败', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.getByText('渲染失败', { exact: true })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}

for (const width of [621, 1440]) {
test(`first rectangle after leaving an architecture diagram with a saved viewport / ${width}px`, async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({ width, height: width === 621 ? 641 : 1000 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/?diagram=enterprise-architecture-v2');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.evaluate(async () => {
    const instance = (window as unknown as {
      reactFlowInstance?: { setViewport: (value: { x: number; y: number; zoom: number }) => Promise<boolean> };
    }).reactFlowInstance;
    if (!instance) throw new Error('Actual canvas API missing');
    await instance.setViewport({ x: 0, y: 0, zoom: 1.15 });
  });
  await page.getByRole('link', { name: /^(?:V )?Vizly$/ }).click();
  await page.getByRole('button', { name: '新建流程图', exact: true }).click();
  await page.getByRole('button', { name: '选择第一个图形', exact: true }).click();
  await page.getByRole('dialog', { name: '基础形状', exact: true }).getByRole('button', { name: '矩形', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.getByText('渲染失败', { exact: true })).toHaveCount(0);
  const id = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('diagram');
  if (!id) throw new Error('Created diagram identity missing');
  await expect.poll(() => persistedAutoSaveNodeCount(page, id)).toBe(1);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.getByText('渲染失败', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.getByText('渲染失败', { exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
}
