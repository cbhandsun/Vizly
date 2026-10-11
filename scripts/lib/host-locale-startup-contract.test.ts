// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
describe('current host locale startup ownership', () => {
  it('keeps active locale resources external and waits for initialization before mounting', () => {
    const i18nSource = readFileSync(resolve(root, 'src/i18n.ts'), 'utf8');
    const mainSource = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
    for (const locale of ['en', 'zh']) {
      expect(i18nSource).toContain(`import ${locale}LocaleUrl from './locales/${locale}.json?url'`);
      expect(i18nSource).not.toMatch(new RegExp(`import\\s+${locale}\\s+from ['"]\\./locales/${locale}\\.json['"]`));
      expect(i18nSource).not.toContain(`import('./locales/${locale}.json')`);
      expect(i18nSource).toContain(`loadLocaleResource(${locale}LocaleUrl)`);
    }
    expect(i18nSource).toContain('fallbackLng: false');
    expect(i18nSource).toContain('export const i18nReady: Promise<void>');
    expect(mainSource).toContain("import { i18nReady } from './i18n'");
    expect(mainSource).toContain("import { startApplication } from './main/applicationStartup'");
    expect(mainSource).toContain('void startApplication({');
    expect(mainSource).toContain('ready: i18nReady,');
  });
});
