// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_JSON_IMPORT_MAX_BYTES } from '@/core/utils/fileImportGuards';
import { lightThemePreset } from '@/core/themes/presets/LightTheme';
import type { Theme } from '@/core/themes/types/ThemeTypes';
import { EnhancedThemeSelector } from '../EnhancedThemeSelector';

const mocks = vi.hoisted(() => ({
  useConfigIntegration: vi.fn(),
  useTheme: vi.fn(),
}));

vi.mock('@/core/hooks/useConfigIntegration', () => ({
  useConfigIntegration: mocks.useConfigIntegration,
}));

vi.mock('@/core/themes/useCoreTheme', () => ({
  useTheme: mocks.useTheme,
}));

vi.mock('@/core/themes/themeLogging', () => ({
  logThemeSelectorApplyPresetFailure: vi.fn(),
  logThemeSelectorChangeFailure: vi.fn(),
  logThemeSelectorCreateCustomThemeFailure: vi.fn(),
  logThemeSelectorDeleteCustomThemeFailure: vi.fn(),
  logThemeSelectorExportFailure: vi.fn(),
  logThemeSelectorImportFailure: vi.fn(),
  logThemeSelectorImportRejected: vi.fn(),
  logThemeSelectorLoadFailure: vi.fn(),
  logThemeSelectorMissingBaseTheme: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; name?: string }) => {
      const translations: Record<string, string> = {
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'config.actions.close': 'Close',
        'theme.selector.actions.apply': 'Apply',
        'theme.selector.actions.cancel': 'Cancel',
        'theme.selector.actions.create': 'Create',
        'theme.selector.actions.delete': 'Delete',
        'theme.selector.baseTheme': 'Base Theme',
        'theme.selector.categories.built-in': 'Foundation theme',
        'theme.selector.choose': 'Choose Theme',
        'theme.selector.create': 'Create theme',
        'theme.selector.custom': 'Custom',
        'theme.selector.dark': 'Dark',
        'theme.selector.deleteConfirmDescription': 'This action cannot be undone.',
        'theme.selector.desc': 'Description',
        'theme.selector.emptyCustom': 'No custom themes yet',
        'theme.selector.export': 'Export',
        'theme.selector.import': 'Import',
        'theme.selector.importStatus.failed': 'Import failed. Check the file format and try again.',
        'theme.selector.importStatus.rejected': 'This file is too large to import.',
        'theme.selector.importStatus.success': 'Theme configuration imported.',
        'theme.selector.light': 'Light',
        'theme.selector.loading': 'Loading themes...',
        'theme.selector.mode': 'Mode',
        'theme.selector.name': 'Theme Name',
        'theme.selector.presets': 'Presets',
        'theme.selector.settings': 'Settings',
        'theme.selector.themes': 'Themes',
        'theme.selector.title': 'Theme Settings',
      };
      if (key === 'theme.selector.deleteConfirmTitle') return `Delete “${options?.name}”?`;
      return translations[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

const customTheme: Theme = {
  ...lightThemePreset.theme,
  id: 'custom-ocean',
  name: 'Custom Ocean',
  description: 'A custom theme',
};

describe('EnhancedThemeSelector', () => {
  const setTheme = vi.fn().mockResolvedValue(undefined);
  const addCustomTheme = vi.fn();
  const removeCustomTheme = vi.fn().mockReturnValue(true);
  const applyPreset = vi.fn().mockReturnValue(lightThemePreset.theme);
  const importConfig = vi.fn().mockResolvedValue(undefined);
  const exportConfig = vi.fn().mockResolvedValue({});

  const themeManager = {
    addCustomTheme,
    getAvailablePresetIds: vi.fn().mockReturnValue(['light']),
    getCurrentTheme: vi.fn().mockResolvedValue(lightThemePreset.theme),
    getCurrentThemeId: vi.fn().mockReturnValue('light'),
    getCustomThemes: vi.fn().mockReturnValue([customTheme]),
    getTheme: vi.fn().mockResolvedValue(lightThemePreset.theme),
    getThemeColor: vi.fn().mockReturnValue('#1677ff'),
    preloadThemes: vi.fn().mockResolvedValue(undefined),
    removeCustomTheme,
    setTheme: vi.fn().mockResolvedValue(lightThemePreset.theme),
  };
  const presetManager = {
    applyPreset,
    getAllPresets: vi.fn().mockReturnValue([lightThemePreset]),
    getCategories: vi.fn().mockReturnValue([
      { id: 'built-in', name: '内置主题', description: '', order: 1 },
    ]),
  };
  const integration = {
    getPresetManager: () => presetManager,
    getThemeManager: () => themeManager,
  };

  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    themeManager.getCustomThemes.mockReturnValue([customTheme]);
    mocks.useTheme.mockReturnValue([lightThemePreset.theme, setTheme]);
    mocks.useConfigIntegration.mockReturnValue([
      { integration, isReady: true },
      { exportConfig, importConfig },
    ]);
  });

  const openSelector = async () => {
    render(<EnhancedThemeSelector ariaLabel="Open theme settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open theme settings' }));
    return screen.findByRole('dialog', { name: 'Theme Settings' });
  };

  it('loads theme previews only when the selector is opened', async () => {
    render(<EnhancedThemeSelector ariaLabel="Open theme settings" />);

    expect(themeManager.preloadThemes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open theme settings' }));
    await waitFor(() => expect(themeManager.preloadThemes).toHaveBeenCalledWith(['light']));
  });

  it('uses native pressed buttons and serializes theme selection', async () => {
    await openSelector();
    await waitFor(() => expect(screen.getByRole('tabpanel').querySelector('button[aria-pressed]')).not.toBeNull());
    const themeButton = screen.getByRole('tabpanel').querySelector('button[aria-pressed]') as HTMLButtonElement;

    expect(themeButton.tagName).toBe('BUTTON');
    expect(themeButton.getAttribute('aria-label')).toBe(lightThemePreset.name);
    expect(themeButton.getAttribute('aria-pressed')).toBe('true');
    expect(themeButton.className).toContain('min-h-[44px]');

    fireEvent.click(themeButton);
    fireEvent.click(themeButton);
    await waitFor(() => expect(setTheme).toHaveBeenCalledTimes(1));
  });

  it('exposes preset state through a native button', async () => {
    await openSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Presets' }));

    await waitFor(() => expect(screen.getByRole('tabpanel').querySelector('button[aria-pressed]')).not.toBeNull());
    const presetButton = screen.getByRole('tabpanel').querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(presetButton.tagName).toBe('BUTTON');
    expect(presetButton.getAttribute('aria-label')).toBe(lightThemePreset.name);
    expect(presetButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('uses a stable native import trigger and reports rejected files', async () => {
    await openSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));

    const importButton = screen.getByRole('button', { name: 'Import' });
    const importInput = screen.getByLabelText('Import') as HTMLInputElement;
    const clickSpy = vi.spyOn(importInput, 'click');
    expect(importButton.getAttribute('aria-controls')).toBe(importInput.id);

    fireEvent.click(importButton);
    expect(clickSpy).toHaveBeenCalledOnce();

    const oversizedFile = new File(
      [new Uint8Array(THEME_JSON_IMPORT_MAX_BYTES + 1)],
      'themes.json',
      { type: 'application/json' },
    );
    fireEvent.change(importInput, { target: { files: [oversizedFile] } });
    expect((await screen.findByRole('alert')).textContent).toBe('This file is too large to import.');
    expect(importConfig).not.toHaveBeenCalled();
  });

  it('reports successful and malformed imports without exposing parser details', async () => {
    await openSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    const importInput = screen.getByLabelText('Import') as HTMLInputElement;

    fireEvent.change(importInput, {
      target: { files: [new File(['{}'], 'themes.json', { type: 'application/json' })] },
    });
    expect((await screen.findByRole('status')).textContent).toBe('Theme configuration imported.');
    expect(importConfig).toHaveBeenCalledWith({});

    fireEvent.change(importInput, {
      target: { files: [new File(['{invalid'], 'themes.json', { type: 'application/json' })] },
    });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Import failed. Check the file format and try again.',
    );
    expect(importConfig).toHaveBeenCalledTimes(1);
  });

  it('labels custom theme fields, sanitizes names, and protects deletion', async () => {
    await openSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));

    const applyButton = screen.getByRole('button', { name: 'Apply Custom Ocean' });
    const deleteButton = screen.getByRole('button', { name: 'Delete Custom Ocean' });
    expect(applyButton.className).toContain('min-h-[44px]');
    expect(deleteButton.className).toContain('min-w-[44px]');

    fireEvent.click(deleteButton);
    const confirmDelete = await screen.findByRole('button', { name: 'Delete' });
    expect(removeCustomTheme).not.toHaveBeenCalled();
    fireEvent.click(confirmDelete);
    await waitFor(() => expect(removeCustomTheme).toHaveBeenCalledWith('custom-ocean'));

    fireEvent.click(screen.getByRole('button', { name: 'Create theme' }));
    const nameInput = screen.getByRole('textbox', { name: 'Theme Name' });
    const createButton = screen.getByRole('button', { name: 'Create' });
    expect((createButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: '  Audit Theme  ' } });
    fireEvent.click(createButton);
    await waitFor(() => expect(addCustomTheme).toHaveBeenCalled());
    expect(addCustomTheme.mock.calls[0]?.[0]).toMatchObject({ name: 'Audit Theme' });
  });

  it('moves an active custom theme to a safe fallback before deletion', async () => {
    mocks.useTheme.mockReturnValue([customTheme, setTheme]);
    await openSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Custom Ocean' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(removeCustomTheme).toHaveBeenCalledWith('custom-ocean'));
    expect(themeManager.setTheme).toHaveBeenCalledWith('light');
    expect(themeManager.setTheme.mock.invocationCallOrder[0]).toBeLessThan(
      removeCustomTheme.mock.invocationCallOrder[0],
    );
  });

  it('retains an active custom theme when fallback activation fails', async () => {
    mocks.useTheme.mockReturnValue([customTheme, setTheme]);
    themeManager.setTheme.mockRejectedValueOnce(new Error('fallback failed'));
    await openSelector();
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Custom Ocean' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(themeManager.setTheme).toHaveBeenCalledWith('light'));
    expect(removeCustomTheme).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete Custom Ocean' })).not.toBeNull();
  });
});
