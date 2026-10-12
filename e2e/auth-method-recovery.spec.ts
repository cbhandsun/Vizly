import { expect, test } from '@playwright/test';
import en from '../src/locales/en.json' with { type: 'json' };

for (const width of [390, 1280]) {
  test(`authentication method switching clears validation and preserves input / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
    await page.goto('/#/manage');
    await page.getByRole('button', { name: en.workspace.settings, exact: true }).click();
    await page.getByRole('menuitem', { name: en.workspace.signIn, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: en.auth.login, exact: true });
    await expect(dialog).toBeVisible();

    for (const method of ['tabs', 'inline-actions']) {
      const panel = dialog.getByRole('tabpanel');
      await panel.getByLabel(en.auth.modal.emailPlaceholder, { exact: true }).fill('member@example.com');
      await panel.getByRole('button', { name: /Sign In$/ }).click();
      await expect(panel.getByText(en.auth.modal.password.required, { exact: true })).toBeVisible();
      if (method === 'tabs') {
        await dialog.getByRole('tab', { name: en.auth.modal.tabs.register, exact: true }).click();
        await dialog.getByRole('tab', { name: en.auth.modal.tabs.password, exact: true }).click();
      } else {
        await panel.getByRole('button', { name: en.auth.modal.registerNow, exact: true }).click();
        await dialog.getByRole('tabpanel').getByRole('button', { name: en.auth.modal.backToLogin, exact: true }).click();
      }
      const restoredPanel = dialog.getByRole('tabpanel');
      const password = restoredPanel.getByLabel(en.auth.modal.password.placeholder, { exact: true });
      await expect(password).not.toHaveAttribute('aria-invalid', 'true');
      await expect(password).not.toHaveAttribute('aria-describedby');
      await expect(restoredPanel.getByLabel(en.auth.modal.emailPlaceholder, { exact: true })).toHaveValue('member@example.com');
      await expect(restoredPanel.locator('.ant-form-item-explain-error')).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await testInfo.attach('authentication validation recovery', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}
