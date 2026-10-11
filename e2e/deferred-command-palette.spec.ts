import { expect, test } from '@playwright/test';

test('command search loads on demand, opens by keyboard and restores focus', async ({ page }, testInfo) => {
  const commandRequests: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/\/CommandPalette-[^/]+\.js$/.test(pathname)) commandRequests.push(pathname);
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/?diagram=wms-process-flow-v1');
  const trigger = page.getByRole('button', { name: '打开命令搜索', exact: true });
  await expect(trigger).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="allocation"]')).toBeVisible();
  expect(commandRequests).toEqual([]);
  await trigger.focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  const search = page.getByRole('dialog').getByRole('combobox', { name: '搜索命令或图表', exact: true });
  await expect(search).toBeFocused();
  expect(commandRequests).toHaveLength(1);
  await testInfo.attach('loaded command search', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(search).toBeFocused();
  expect(commandRequests).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('command search can be dismissed while loading without opening after resolution', async ({ page }) => {
  let release: () => void = () => { throw new Error('No pending command chunk'); };
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/CommandPalette-[^/]+\.js$/, async route => {
    await blocked;
    await route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/?diagram=wms-process-flow-v1');
  const trigger = page.getByRole('button', { name: '打开命令搜索', exact: true });
  await expect(trigger).toBeVisible();
  const chunkRequest = page.waitForRequest(/\/CommandPalette-[^/]+\.js$/);
  await trigger.click();
  await chunkRequest;
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('加载中...');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const loaded = page.waitForResponse(/\/CommandPalette-[^/]+\.js$/);
  release();
  expect((await loaded).status()).toBe(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await trigger.click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: '搜索命令或图表', exact: true })).toBeFocused();
});

test('a failed command chunk preserves the canvas and offers focused dismissal', async ({ page }, testInfo) => {
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1; });
  await page.route(/\/CommandPalette-[^/]+\.js$/, route => route.abort('failed'));
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/?diagram=wms-process-flow-v1');
  const trigger = page.getByRole('button', { name: '打开命令搜索', exact: true });
  await expect(trigger).toBeVisible();
  const initialNavigations = navigations;
  await trigger.click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('命令搜索未能加载。关闭此窗口可继续编辑。');
  expect(navigations).toBe(initialNavigations);
  await testInfo.attach('recoverable command load failure', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.react-flow__node[data-id="allocation"]')).toBeVisible();
});
