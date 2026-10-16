import { expect, test } from '@playwright/test';

for (const locale of ['en', 'zh']) {
  test(`initial workspace fetches only its active locale / ${locale}`, async ({ page }) => {
    await page.addInitScript(language => localStorage.setItem('i18nextLng', language), locale);
    const requests: string[] = [];
    page.on('request', request => {
      const match = new URL(request.url()).pathname.match(/\/(?:src\/locales\/|assets\/)(en|zh)(?:-[^/]+)?\.json$/);
      if (match) requests.push(match[1]);
    });
    const response = page.waitForResponse(value => new URL(value.url()).pathname
      .match(new RegExp(`/(?:src/locales/|assets/)${locale}(?:-[^/]+)?\\.json$`)) !== null);
    await page.goto('/#/manage');
    await expect(page.getByRole('main', { name: locale === 'zh' ? '工作区' : 'Workspace', exact: true })).toBeVisible();
    const active = await response;
    expect(active.status()).toBe(200);
    const text = await active.text();
    const parsed: unknown = JSON.parse(text);
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
    if (new URL(active.url()).pathname.startsWith('/assets/')) expect(text).toBe(JSON.stringify(parsed));
    expect(requests).toEqual([locale]);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(locale);
  });
}

for (const width of [390, 1280]) {
  test(`workspace language menu switches locale and restores keyboard focus / ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      if (localStorage.getItem('i18nextLng') === null) localStorage.setItem('i18nextLng', 'en');
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.name));
    await page.goto('/#/manage');
    await expect(page.getByRole('main', { name: 'Workspace', exact: true })).toBeVisible();
    const language = page.getByRole('button', { name: /^Language: English$/ });
    await language.focus();
    await page.keyboard.press('ArrowDown');
    await expect(language).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeFocused();
    await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
    await expect(page.getByRole('main', { name: '工作区', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
    await expect(language).toHaveCount(0);
    const currentLanguage = page.getByRole('button', { name: /^语言.*简体中文$/ });
    await expect(currentLanguage).toHaveAttribute('aria-expanded', 'false');
    await expect(currentLanguage).toBeFocused();
    await page.reload();
    await expect(page.getByRole('main', { name: '工作区', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
