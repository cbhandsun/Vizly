import { expect, test } from '@playwright/test';
import en from '../src/locales/en.json' with { type: 'json' };

test.describe.configure({ timeout: 5000 });
for (const width of [390, 1280]) {
  for (const method of ['password', 'magiclink', 'register'] as const) {
    test(`authentication labels remain centered in the scrolling body / ${method} / ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
      await page.goto('/#/manage');
      await page.getByRole('button', { name: en.workspace.settings, exact: true }).click();
      await page.getByRole('menuitem', { name: en.workspace.signIn, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: en.auth.login, exact: true });
      const activeTab = dialog.getByRole('tab', { name: en.auth.modal.tabs[method], exact: true });
      await activeTab.click();
      await expect(activeTab).toHaveAttribute('aria-selected', 'true');
      const panel = dialog.getByRole('tabpanel');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('id', await activeTab.getAttribute('aria-controls') ?? 'missing-controlled-panel');
      const submitNames = { password: en.auth.modal.loginButton, magiclink: en.auth.modal.sendMagicLink, register: en.auth.modal.register.button };
      const submit = panel.getByRole('button', { name: submitNames[method], exact: true });
      await expect(submit).toBeVisible();
      await expect(submit).toHaveAttribute('type', 'submit');
      // Chromium blockifies inline-flex children of flex containers. Preserve
      // the authored rule as well as checking the actual centered layout.
      expect(await activeTab.evaluate(() => {
        const declarations: string[] = [];
        const inspect = (rules: CSSRuleList): void => {
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText === '.auth-modal .ant-tabs-tab-btn') {
              declarations.push(rule.style.display);
            }
            if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) inspect(rule.cssRules);
          }
        };
        for (const sheet of document.styleSheets) inspect(sheet.cssRules);
        return declarations;
      })).toContain('inline-flex');
      await expect(activeTab).toHaveCSS('display', 'flex');
      await expect(activeTab).toHaveCSS('align-items', 'center');
      expect(await activeTab.evaluate(tab => {
        const range = document.createRange();
        range.selectNodeContents(tab);
        const text = range.getBoundingClientRect();
        const box = tab.getBoundingClientRect();
        if (text.height <= 0 || box.height < 44) throw new Error('Tab label or touch target is missing');
        return Math.abs((text.top + text.bottom) / 2 - (box.top + box.bottom) / 2);
      })).toBeLessThanOrEqual(1);
      expect(await activeTab.evaluate(tab => {
        const tabs = tab.closest('.ant-tabs');
        if (!tabs) throw new Error('Authentication tabs are missing');
        return Number.parseFloat(getComputedStyle(tabs).marginTop) || 0;
      })).toBeGreaterThanOrEqual(0);
      const inputWrappers = dialog.locator('.ant-input-affix-wrapper-lg');
      expect(await inputWrappers.count()).toBeGreaterThan(0);
      for (const input of await inputWrappers.all()) await expect(input).toHaveCSS('align-items', 'center');
      await testInfo.attach('authentication alignment', { body: await dialog.screenshot(), contentType: 'image/png' });
    });
  }
}

