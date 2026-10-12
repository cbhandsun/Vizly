import { expect, test } from '@playwright/test';
import { persistedDiagramCount } from './helpers/localDiagramDatabase';

test('real browser storage quota failure does not create a ghost document and can recover', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/manage');
  const create = page.locator('.create-btn-main');
  await expect(create).toBeEnabled();
  const initialCount = await persistedDiagramCount(page);
  const origin = new URL(page.url()).origin;
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1024 });
    const limited = await cdp.send('Storage.getUsageAndQuota', { origin });
    expect(limited.quota).toBe(1024);
    await create.click();
    await expect(page.getByText('Failed to create diagram.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#\/manage$/);
    await expect(create).toBeEnabled();
    expect(await persistedDiagramCount(page)).toBe(initialCount);
    await page.reload();
    await expect(create).toBeEnabled();
    expect(await persistedDiagramCount(page)).toBe(initialCount);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin });
    const restored = await cdp.send('Storage.getUsageAndQuota', { origin });
    expect(restored.quota).toBeGreaterThan(limited.quota);
    await create.click();
    await expect(page).toHaveURL(/diagram=/);
    expect(await persistedDiagramCount(page)).toBe(initialCount + 1);
  } finally {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin });
    await cdp.detach();
  }
});
