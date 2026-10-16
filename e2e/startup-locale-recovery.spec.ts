import { expect, test } from '@playwright/test';

for (const failure of [
  { name: 'unavailable', status: 503, body: 'private-locale-failure-credential' },
  { name: 'malformed', status: 200, body: '{private-locale-failure-credential' },
  { name: 'empty', status: 200, body: '{}' },
]) {
for (const width of [390, 1280]) {
test(`failed active locale (${failure.name}) blocks mount and offers safe reload recovery / ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  let failedRequests = 0;
  await page.route(/\/(?:src\/locales\/|assets\/)(?:en|zh)(?:-[^/]+)?\.json(?:\?.*)?$/, async route => {
    failedRequests += 1;
    await route.fulfill({ status: failure.status, contentType: 'application/json', body: failure.body });
  });
  await page.goto('/#/manage');
  const scriptPaths = await page.locator('script[src]').evaluateAll(scripts =>
    scripts.map(script => new URL(script.getAttribute('src') ?? '', location.href).pathname));
  expect(scriptPaths.some(path => /^\/assets\/[^/]+\.js$/.test(path))).toBe(true);
  expect(scriptPaths.some(path => path === '/@vite/client' || path.startsWith('/src/'))).toBe(false);
  await expect(page.locator('textarea')).toBeVisible();
  expect(failedRequests).toBeGreaterThan(0);
  const diagnostic = await page.locator('textarea').inputValue();
  expect(JSON.parse(diagnostic)).toMatchObject({ code: 'application-readiness-failed', stage: 'readiness' });
  expect(await page.locator('body').innerText()).not.toContain('private-locale-failure-credential');
  await expect(page.locator('button')).toBeFocused();
  const target = await page.locator('button').boundingBox();
  expect(target?.height).toBeGreaterThanOrEqual(44);
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await testInfo.attach('startup recovery', { body: await page.screenshot(), contentType: 'image/png' });
  await page.unrouteAll({ behavior: 'wait' });
  await page.locator('button').press('Enter');
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByRole('main', { name: '工作区', exact: true })).toBeVisible();
});
}
}
