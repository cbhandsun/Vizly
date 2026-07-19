import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { ThemePresetManager } from '../../themes/ThemePresetManager';
import { ConfigIntegration } from '../ConfigIntegration';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

const createIntegration = () => new ConfigIntegration(diagramConfigManager, {
  enableMigration: false,
  preserveExistingConfig: true,
  enableValidation: true,
  enablePerformanceOptimization: false,
  migrationStrategy: 'manual',
});

describe('ConfigIntegration', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('rejects non-object integrated config imports', async () => {
    const integration = createIntegration();

    await expect(integration.importIntegratedConfig('not an object')).rejects.toThrow('must be an object');

    integration.dispose();
  });

  it('rejects malformed presets before importing a theme package', async () => {
    const integration = createIntegration();

    await expect(integration.importIntegratedConfig({ presets: 'not-array' })).rejects.toThrow('presets must be an array');

    integration.dispose();
  });

  it('redacts sensitive values when theme sync fails', async () => {
    const integration = createIntegration() as any;
    await integration.waitForReady();
    Object.values(safeLogState).forEach(mock => mock.mockReset());

    integration.synchronizer.themeManager = {
      setTheme: vi.fn().mockRejectedValue(new Error('Authorization: Bearer live-token')),
      dispose: vi.fn(),
    };

    await integration.synchronizer.syncCurrentTheme('dark');

    const payload = JSON.stringify(safeLogState.error.mock.calls);
    expect(payload).toContain('Failed to sync theme:');
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('live-token');

    integration.dispose();
  });

  it('handles malformed exported presets JSON in fallback mode', async () => {
    const integration = createIntegration() as any;
    await integration.waitForReady();
    Object.values(safeLogState).forEach(mock => mock.mockReset());

    vi.spyOn(ThemePresetManager.prototype, 'exportThemePackage').mockReturnValue('{malformed-json');

    const exported = await integration.exportIntegratedConfig();

    expect(exported.presets).toEqual([]);
    expect(safeLogState.warn).toHaveBeenCalledWith(expect.stringContaining('导出主题预设包解析失败'));

    integration.dispose();
  });
});
