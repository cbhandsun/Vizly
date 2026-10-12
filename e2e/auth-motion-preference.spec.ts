import { expect, test } from '@playwright/test';
import en from '../src/locales/en.json' with { type: 'json' };

test('authentication follows initial and live system motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  await page.goto('/#/manage');
  await page.getByRole('button', { name: en.workspace.settings, exact: true }).click();
  await page.getByRole('menuitem', { name: en.workspace.signIn, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: en.auth.login, exact: true });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button', { name: en.common.close, exact: true });
  const durations = () => close.evaluate(element => getComputedStyle(element).transitionDuration
    .split(',').map(value => Number.parseFloat(value)));

  // Read a real Ant Design component style, rather than only matchMedia or a
  // mocked provider token. The same open dialog must respond without reload.
  await expect.poll(durations).toEqual([0, 0]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await durations()).every(duration => duration > 0)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(durations).toEqual([0, 0]);
  await expect(dialog.getByRole('tab', { name: en.auth.modal.tabs.password, exact: true }))
    .toHaveAttribute('aria-selected', 'true');
});
