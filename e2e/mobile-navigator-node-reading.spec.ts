import { expect, test } from '@playwright/test';

test('mobile navigation restores readable remote-stage node details from overview', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.name));
  await page.goto('/#/?diagram=wms-process-flow-v1');
  await page.locator('.react-flow__node[data-id="allocation"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: /^适应(?:\s|\(|$)/ }).click();
  await page.getByRole('button', { name: '图层', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '导航', exact: true }).click();
  const drawer = page.locator('.side-drawer');
  await drawer.getByRole('textbox').fill('WCS');
  await drawer.getByRole('tree').locator('.ant-tree-node-content-wrapper').filter({ hasText: /WCS/ }).last().click();
  const selected = page.locator('.react-flow__node[data-id="wcs-integration"].selected');
  await expect(selected).toHaveCount(1);
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  const reading = () => selected.evaluate(node => {
    const viewport = document.querySelector('.react-flow__viewport');
    const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
    if (!viewport || !canvas) throw new Error('Rendered viewport missing');
    const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const details: { text: string; fontPx: number; visible: boolean; hit: boolean }[] = [];
    let text: Node | null;
    while ((text = walker.nextNode())) {
      const parent = text.parentElement;
      if (!parent || !text.textContent?.trim() || parent.closest('button,[aria-hidden="true"]')) continue;
      const range = document.createRange(); range.selectNodeContents(text);
      const rect = range.getBoundingClientRect();
      const style = getComputedStyle(parent);
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      details.push({ text: text.textContent.trim(), fontPx: parseFloat(style.fontSize) * zoom,
        visible: rect.width > 0 && rect.height > 0 && rect.left >= canvas.left && rect.right <= canvas.right
          && rect.top >= canvas.top && rect.bottom <= canvas.bottom && style.visibility !== 'hidden' && style.display !== 'none',
        hit: !!hit && node.contains(hit) });
    }
    return details;
  });
  await expect.poll(async () => (await reading()).filter(value => value.visible && value.hit && value.fontPx >= 12).length).toBeGreaterThanOrEqual(2);
  const details = await reading();
  expect(details.filter(value => value.visible && value.hit).map(value => value.text)).toEqual(expect.arrayContaining(['WCS/自动化接口', '分拣机/AGV/密集库']));
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  await testInfo.attach('mobile focused node', { body: await page.screenshot(), contentType: 'image/png' });
});
