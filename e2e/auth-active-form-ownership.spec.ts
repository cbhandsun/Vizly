import { expect, test } from '@playwright/test';
import en from '../src/locales/en.json' with { type: 'json' };

test('authentication keeps only the active form mounted while preserving entered values', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  await page.goto('/#/manage');
  await page.getByRole('button', { name: en.workspace.settings, exact: true }).click();
  await page.getByRole('menuitem', { name: en.workspace.signIn, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: en.auth.login, exact: true });
  const activePanel = dialog.getByRole('tabpanel');
  await expect(activePanel.getByRole('button', { name: en.auth.modal.loginButton, exact: true })).toBeVisible();
  await activePanel.getByLabel(en.auth.modal.emailPlaceholder, { exact: true }).fill('member@example.invalid');
  await dialog.getByRole('tab', { name: en.auth.modal.tabs.register, exact: true }).click();
  await expect(activePanel.getByLabel(en.auth.modal.register.confirmPlaceholder, { exact: true })).toBeVisible();
  await expect(activePanel.getByRole('button', { name: en.auth.modal.register.button, exact: true })).toBeVisible();
  await expect(dialog.locator('form')).toHaveCount(1);
  await dialog.getByRole('tab', { name: en.auth.modal.tabs.magiclink, exact: true }).click();
  await expect(activePanel.getByRole('button', { name: en.auth.modal.sendMagicLink, exact: true })).toBeVisible();
  await expect(dialog.locator('form')).toHaveCount(1);
  await dialog.getByRole('tab', { name: en.auth.modal.tabs.password, exact: true }).click();
  await expect(dialog.locator('form')).toHaveCount(1);
  await expect(activePanel.getByLabel(en.auth.modal.emailPlaceholder, { exact: true })).toHaveValue('member@example.invalid');
});
