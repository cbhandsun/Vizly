import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightThemePreset } from '../presets/LightTheme';
import {
  coerceThemeImport,
  coerceThemePackageImport,
  coerceThemePresetImport,
  parseThemeImportJson,
  THEME_IMPORT_MAX_CHARS,
  THEME_IMPORT_MAX_PRESETS,
} from '../themeImportSecurity';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('themeImportSecurity', () => {
  it('bounds parsed theme JSON', () => {
    expect(() => parseThemeImportJson('x'.repeat(THEME_IMPORT_MAX_CHARS + 1))).toThrow('too large');
  });

  it('rejects malformed theme JSON', () => {
    expect(() => parseThemeImportJson('{invalid-json')).toThrow('Theme import JSON is invalid');
  });

  it('coerces a valid theme preset and forces imported category', () => {
    const preset = coerceThemePresetImport(clone(lightThemePreset), 'imported-light', 'custom');

    expect(preset.id).toBe('imported-light');
    expect(preset.category).toBe('custom');
    expect(preset.theme.id).toBe('imported-light');
    expect(preset.theme.palette.primary.main).toBe('#007bff');
  });

  it('rejects unsafe CSS values in theme colors', () => {
    const theme = clone(lightThemePreset.theme);
    theme.palette.primary.main = 'url(javascript:alert(1))';

    expect(() => coerceThemeImport(theme)).toThrow('safe CSS color');
  });

  it('rejects oversized theme packages before import', () => {
    const packageData = {
      presets: Array.from({ length: THEME_IMPORT_MAX_PRESETS + 1 }, () => clone(lightThemePreset)),
    };

    expect(() => coerceThemePackageImport(packageData)).toThrow('at most');
  });
});

describe('ThemePresetManager secure import', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('imports preset objects and rejects invalid package data atomically', async () => {
    const [{ LayeredConfigManager }, { ThemePresetManager }] = await Promise.all([
      import('../../config/LayeredConfigManager'),
      import('../ThemePresetManager'),
    ]);
    const manager = new ThemePresetManager(LayeredConfigManager.getInstance());

    const result = manager.importPreset(JSON.stringify({ preset: clone(lightThemePreset) }));
    expect(result.success).toBe(true);
    expect(manager.getAllPresets()).toHaveLength(1);

    const invalidPackage = clone({
      presets: [
        lightThemePreset,
        {
          ...lightThemePreset,
          name: 'bad',
          theme: {
            ...lightThemePreset.theme,
            palette: {
              ...lightThemePreset.theme.palette,
              primary: {
                ...lightThemePreset.theme.palette.primary,
                main: 'expression(alert(1))',
              },
            },
          },
        },
      ],
    });

    const before = manager.getAllPresets().length;
    const packageResult = manager.importThemePackage(invalidPackage);

    expect(packageResult.success).toBe(false);
    expect(manager.getAllPresets()).toHaveLength(before);
  });

  it('sanitizes preset metadata created through the manager API', async () => {
    const [{ LayeredConfigManager }, { ThemePresetManager }] = await Promise.all([
      import('../../config/LayeredConfigManager'),
      import('../ThemePresetManager'),
    ]);
    const manager = new ThemePresetManager(LayeredConfigManager.getInstance());

    const preset = manager.createPreset(clone(lightThemePreset.theme), {
      category: 'unexpected-category',
      name: '  Imported Name  ',
      description: 'x'.repeat(300),
      tags: [
        ' first ',
        ...Array.from({ length: 30 }, (_, index) => `tag-${index}`),
        123 as unknown as string,
      ],
    });

    expect(preset.category).toBe('custom');
    expect(preset.name).toBe('Imported Name');
    expect(preset.description).toHaveLength(240);
    expect(preset.tags).toHaveLength(16);
    expect(preset.tags[0]).toBe('first');
    expect(preset.tags).not.toContain(123);
  });

  it('creates structurally complete template themes and typed export envelopes', async () => {
    const [{ LayeredConfigManager }, { ThemePresetManager }] = await Promise.all([
      import('../../config/LayeredConfigManager'),
      import('../ThemePresetManager'),
    ]);
    const manager = new ThemePresetManager(LayeredConfigManager.getInstance());
    const baseTheme = clone(lightThemePreset.theme);

    const preset = manager.createPresetFromTemplate('ocean-blue', baseTheme, {
      name: 'Template Export',
    });

    expect(preset).not.toBeNull();
    expect(preset?.theme.palette.primary.main).toBe('#0077be');
    expect(preset?.theme.typography).toEqual(baseTheme.typography);
    expect(preset?.theme.animation).toEqual(baseTheme.animation);
    const exported = JSON.parse(manager.exportPreset(preset!.id) ?? '{}');
    expect(exported).toMatchObject({
      version: '1.0',
      preset: { id: preset!.id, name: 'Template Export' },
    });
    expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false);
  });
});
