import { expect, test, type Page } from '@playwright/test';

type Viewport = { x: number; y: number; zoom: number };
const readViewport = (page: Page) => page.evaluate(() => {
  const viewport = document.querySelector('.react-flow__viewport');
  if (!viewport) throw new Error('Canvas viewport missing');
  const matrix = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
  return { x: matrix.e, y: matrix.f, zoom: matrix.a };
});
const readableNodeLabels = (page: Page) => page.evaluate(() => {
  const viewport = document.querySelector('.react-flow__viewport');
  if (!viewport) throw new Error('Canvas viewport missing');
  const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
  let readable = 0;
  for (const node of document.querySelectorAll('.react-flow__node')) {
    if (/group|domain|swimlane/i.test(node.className)) continue;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode())) {
      const parent = text.parentElement;
      if (!parent || !text.textContent?.trim() || parent.closest('button,[aria-hidden="true"],script,style')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.fontSize) * zoom < 12) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.left < 0 || rect.right > innerWidth
        || rect.top < 84 || rect.bottom > innerHeight - 64) continue;
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (hit && node.contains(hit)) readable++;
    }
  }
  return readable;
});
const viewportError = async (page: Page, desired: Viewport) => {
  const actual = await readViewport(page);
  return Math.max(Math.abs(actual.x - desired.x), Math.abs(actual.y - desired.y), Math.abs(actual.zoom - desired.zoom));
};
const setViewport = (page: Page, desired: Viewport) => page.evaluate(async viewport => {
  const instance = (window as unknown as { reactFlowInstance?: { setViewport: (value: Viewport) => Promise<boolean> } }).reactFlowInstance;
  if (!instance || typeof instance.setViewport !== 'function') throw new Error('Actual canvas API missing');
  await instance.setViewport(viewport);
}, desired);
const hasSavedViewport = (page: Page, desired: Viewport) => page.evaluate(viewport => Object.keys(sessionStorage)
  .filter(key => key.startsWith('vizly:viewport:v1:'))
  .some(key => {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object') return false;
    const value = saved as Record<string, unknown>;
    return value.x === viewport.x && value.y === viewport.y && value.zoom === viewport.zoom;
  }), desired);

for (const width of [390, 1440]) {
  test(`explicit overview remains available after a readable first view / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/#/?diagram=wms-process-flow-v1');
    await expect(page.locator('.react-flow__node[data-id="allocation"]')).toBeAttached();
    await expect.poll(() => readableNodeLabels(page)).toBeGreaterThan(0);
    const overview = page.getByRole('button', { name: /^适应(?:\s|\(|$)/ });
    await expect(overview).toBeVisible();
    expect(await overview.evaluate(button => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return !!hit && button.contains(hit);
    })).toBe(true);
    await overview.click();
    await expect.poll(async () => (await readViewport(page)).zoom).toBeLessThan(0.5);
    await testInfo.attach(`explicit overview ${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
  });

  test(`reading and saved viewport survive reload / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/#/?diagram=wms-process-flow-v1');
    await expect(page.locator('.react-flow__node[data-id="allocation"]')).toBeAttached();
    // The programmatic API fixture edits the settled initial view.
    await page.waitForTimeout(600);
    await expect.poll(async () => (await readViewport(page)).zoom).toBeGreaterThanOrEqual(1);
    await expect.poll(() => readableNodeLabels(page)).toBeGreaterThan(0);
    await testInfo.attach(`initial readable nodes ${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
    if (width === 390) {
      await expect.poll(async () => (await readViewport(page)).zoom).toBeGreaterThanOrEqual(1);
      await expect.poll(() => page.locator('.react-flow__node').evaluateAll(nodes => nodes.filter(node => {
        if (/group|domain|swimlane/i.test(node.className)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width >= 60 && rect.height >= 20 && rect.left >= 0 && rect.right <= innerWidth
          && rect.top >= 100 && rect.bottom <= innerHeight - 200 && Boolean(node.textContent?.trim());
      }).length)).toBeGreaterThan(0);
      await testInfo.attach('mobile reading view', { body: await page.screenshot(), contentType: 'image/png' });
    }
    const desired: Viewport = { x: -800, y: 120, zoom: 0.85 };
    await setViewport(page, desired);
    await expect.poll(() => viewportError(page, desired)).toBeLessThan(0.01);
    await expect.poll(() => hasSavedViewport(page, desired)).toBe(true);
    await page.reload();
    await expect(page.locator('.react-flow__node[data-id="allocation"]')).toBeAttached();
    await expect.poll(() => viewportError(page, desired)).toBeLessThan(0.01);
    // Observe beyond all initial-fit delays, so a transient restoration cannot pass.
    await page.waitForTimeout(1000);
    expect(await viewportError(page, desired)).toBeLessThan(0.01);
    await page.getByRole('button', { name: '新建页面', exact: true }).click();
    const drawer = page.locator('.side-drawer');
    if (await drawer.isVisible()) {
      await drawer.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await expect(page.getByRole('tab', { name: '页面 2', exact: true })).toHaveAttribute('aria-selected', 'true');
    const second: Viewport = { x: 60, y: -40, zoom: 1.1 };
    await setViewport(page, second);
    await expect.poll(() => hasSavedViewport(page, second)).toBe(true);
    await page.getByRole('tab', { name: '页面 1', exact: true }).click();
    await expect.poll(() => viewportError(page, desired)).toBeLessThan(0.01);
    await page.getByRole('tab', { name: '页面 2', exact: true }).click();
    await expect.poll(() => viewportError(page, second)).toBeLessThan(0.01);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('breakpoint switching preserves each saved viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/?diagram=wms-process-flow-v1');
  await expect(page.locator('.react-flow__node[data-id="allocation"]')).toBeAttached();
  await expect.poll(async () => (await readViewport(page)).zoom).toBeGreaterThanOrEqual(1);
  const mobile: Viewport = { x: -800, y: 120, zoom: 0.85 };
  const desktop: Viewport = { x: -200, y: 60, zoom: 0.9 };
  await setViewport(page, mobile);
  await expect.poll(() => hasSavedViewport(page, mobile)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await readViewport(page)).zoom).toBeGreaterThanOrEqual(1);
  await expect.poll(() => readableNodeLabels(page)).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await setViewport(page, desktop);
  await expect.poll(() => hasSavedViewport(page, desktop)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => viewportError(page, mobile)).toBeLessThan(0.01);
  await page.waitForTimeout(1000);
  expect(await viewportError(page, mobile)).toBeLessThan(0.01);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => viewportError(page, desktop)).toBeLessThan(0.01);
  await page.waitForTimeout(1000);
  expect(await viewportError(page, desktop)).toBeLessThan(0.01);
});

test('first entry into a mobile breakpoint uses reading view', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/?diagram=wms-process-flow-v1');
  await expect(page.locator('.react-flow__node[data-id="allocation"]')).toBeAttached();
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await readViewport(page)).zoom).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1000);
  expect((await readViewport(page)).zoom).toBeGreaterThanOrEqual(1);
  expect(await page.locator('.react-flow__node').evaluateAll(nodes => nodes.filter(node => {
    if (/group|domain|swimlane/i.test(node.className)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width >= 60 && rect.height >= 20 && rect.left >= 0 && rect.right <= innerWidth
      && rect.top >= 100 && rect.bottom <= innerHeight - 200 && Boolean(node.textContent?.trim());
  }).length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await testInfo.attach('mobile breakpoint reading', { body: await page.screenshot(), contentType: 'image/png' });
});
