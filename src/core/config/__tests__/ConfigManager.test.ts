import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigDefinition, ConfigManager as ConfigManagerType } from '../ConfigManager';

const importFreshConfigManager = async () => {
  vi.resetModules();
  return import('../ConfigManager');
};

describe('ConfigManager', () => {
  let manager: ConfigManagerType;
  let module: Awaited<ReturnType<typeof importFreshConfigManager>>;

  beforeEach(async () => {
    localStorage.clear();
    module = await importFreshConfigManager();
    manager = module.ConfigManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('loads valid persisted values and ignores invalid persisted JSON or invalid values', async () => {
    localStorage.setItem('config_theme.mode', JSON.stringify('dark'));
    localStorage.setItem('config_theme.primaryColor', JSON.stringify('not-a-color'));
    localStorage.setItem('config_export.defaultFormat', '{broken');

    module = await importFreshConfigManager();
    manager = module.ConfigManager.getInstance();

    expect(manager.get('theme.mode')).toBe('dark');
    expect(manager.get('theme.primaryColor')).toBe('#1890ff');
    expect(manager.get('export.defaultFormat')).toBe('png');
    expect(localStorage.getItem('config_theme.primaryColor')).toBeNull();
    expect(localStorage.getItem('config_export.defaultFormat')).toBeNull();
  });

  it('removes oversized persisted values during startup', async () => {
    localStorage.setItem('config_theme.customThemes', JSON.stringify(['x'.repeat(300 * 1024)]));

    module = await importFreshConfigManager();
    manager = module.ConfigManager.getInstance();

    expect(manager.get('theme.customThemes')).toEqual([]);
    expect(localStorage.getItem('config_theme.customThemes')).toBeNull();
  });

  it('gets fallbacks, throws for missing config without fallback, and validates set values', () => {
    expect(manager.get('missing.key', 'fallback')).toBe('fallback');
    expect(() => manager.get('missing.key')).toThrow('配置项不存在: missing.key');

    manager.set('theme.primaryColor', '#00ffaa', module.ConfigSource.USER_OVERRIDE);
    expect(manager.get('theme.primaryColor')).toBe('#00ffaa');
    expect(localStorage.getItem('config_theme.primaryColor')).toBe(JSON.stringify('#00ffaa'));

    expect(() => manager.set('theme.primaryColor', 'blue')).toThrow('配置值验证失败: theme.primaryColor');
  });

  it('notifies listeners, removes listeners, and isolates listener failures', () => {
    const listener = vi.fn();
    const throwingListener = vi.fn(() => {
      throw new Error('listener failed');
    });

    manager.addListener('theme.mode', listener);
    manager.addListener('theme.mode', throwingListener);
    manager.set('theme.mode', 'dark', module.ConfigSource.SESSION_STORAGE);

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      key: 'theme.mode',
      oldValue: 'light',
      newValue: 'dark',
      source: module.ConfigSource.SESSION_STORAGE,
    }));
    expect(throwingListener).toHaveBeenCalledTimes(1);

    manager.removeListener('theme.mode', listener);
    manager.removeListener('theme.mode', throwingListener);
    manager.set('theme.mode', 'auto');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sets multiple values atomically after validation and rejects invalid batches', () => {
    manager.setMultiple({
      'theme.mode': 'dark',
      'export.defaultFormat': 'svg',
    }, module.ConfigSource.REMOTE);

    expect(manager.get('theme.mode')).toBe('dark');
    expect(manager.get('export.defaultFormat')).toBe('svg');

    expect(() => manager.setMultiple({
      'theme.mode': 'light',
      'export.defaultFormat': 'exe',
    })).toThrow('批量配置验证失败: export.defaultFormat');
    expect(manager.get('theme.mode')).toBe('dark');
    expect(manager.get('export.defaultFormat')).toBe('svg');
  });

  it('registers custom definitions, hides sensitive values, exports/imports config, and reports stats', () => {
    const secretDefinition: ConfigDefinition<string> = {
      key: 'secret.apiKey',
      defaultValue: 'default-secret',
      persistent: true,
      sensitive: true,
      group: 'secret',
    };
    const customDefinition: ConfigDefinition<number> = {
      key: 'custom.limit',
      defaultValue: 10,
      persistent: false,
      group: 'custom',
      validator: value => value >= 0 || 'limit must be positive',
    };

    manager.registerDefinition(secretDefinition);
    manager.registerDefinition(customDefinition);
    manager.set('secret.apiKey', 'live-secret');
    manager.set('custom.limit', 20);

    expect(manager.getGroup('custom')).toEqual({ 'custom.limit': 20 });
    expect(manager.getAll()).not.toHaveProperty('secret.apiKey');
    expect(manager.exportConfig(true)).not.toContain('live-secret');
    expect(manager.exportConfig()).toContain('"custom.limit": 20');
    expect(manager.getStats()).toMatchObject({
      byGroup: expect.objectContaining({ secret: 1, custom: 1 }),
      sensitive: 1,
    });

    manager.importConfig(JSON.stringify({ 'custom.limit': 5, 'unknown.key': 'ignored' }));
    expect(manager.get('custom.limit')).toBe(5);
    expect(() => manager.importConfig('{broken')).toThrow('配置导入失败');
    expect(() => manager.importConfig(JSON.stringify(['theme.mode', 'dark']))).toThrow('配置导入失败');
    expect(() => manager.importConfig(JSON.stringify({ 'unknown.key': 'ignored' }))).toThrow('配置导入失败');
    expect(() => manager.importConfig(JSON.stringify({ 'custom.limit': -1 }))).toThrow('配置导入失败');
    expect(() => manager.importConfig(JSON.stringify({ 'theme.currentId': 'x'.repeat(70 * 1024) }))).toThrow('配置导入失败');
    expect(manager.get('custom.limit')).toBe(5);
    expect(() => manager.set('custom.limit', -1)).toThrow('配置值验证失败: custom.limit');
  });

  it('strips dangerous nested keys from imported and directly set object configs', () => {
    manager.importConfig(`{
      "theme.presets": {
        "safe": { "name": "usable" },
        "__proto__": { "polluted": true },
        "constructor": { "prototype": { "polluted": true } }
      }
    }`);

    expect(manager.get('theme.presets')).toEqual({ safe: { name: 'usable' } });

    manager.set('theme.presets', {
      valid: true,
      prototype: { polluted: true },
    });

    expect(manager.get('theme.presets')).toEqual({ valid: true });
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('resets config values and restores valid snapshots', () => {
    manager.set('theme.mode', 'dark');
    manager.set('layout.spacing.node', 250);

    const snapshot = manager.createSnapshot();
    manager.set('theme.mode', 'auto');
    manager.reset('theme.mode');
    expect(manager.get('theme.mode')).toBe('light');

    manager.restoreSnapshot(snapshot);
    expect(manager.get('theme.mode')).toBe('dark');
    expect(manager.get('layout.spacing.node')).toBe(250);

    manager.restoreSnapshot(JSON.stringify({
      version: '1.0.0',
      timestamp: Date.now(),
      configs: {
        'theme.mode': 'auto',
        'unknown.key': 'ignored',
      },
    }));
    expect(manager.get('theme.mode')).toBe('auto');

    manager.resetAll();
    expect(manager.get('theme.mode')).toBe('light');
    expect(manager.get('layout.spacing.node')).toBe(100);

    expect(() => manager.reset('missing.key')).toThrow('配置项不存在: missing.key');
    expect(() => manager.restoreSnapshot(JSON.stringify({ version: 'bad' }))).toThrow('配置快照恢复失败');
    expect(() => manager.restoreSnapshot(JSON.stringify({ configs: [] }))).toThrow('配置快照恢复失败');
    expect(() => manager.restoreSnapshot(JSON.stringify({ configs: { 'unknown.key': 'ignored' } }))).toThrow('配置快照恢复失败');
    expect(() => manager.restoreSnapshot(JSON.stringify({ configs: { 'theme.mode': 'invalid' } }))).toThrow('配置快照恢复失败');
    expect(() => manager.restoreSnapshot(JSON.stringify({
      configs: {
        'theme.customThemes': ['x'.repeat(70 * 1024)],
      },
    }))).toThrow('配置快照恢复失败');
    expect(manager.get('theme.mode')).toBe('light');
  });

  it('supports helper accessors and diagram config creation', async () => {
    module.setConfig('layout.spacing.node', 180);
    module.setConfig('layout.spacing.level', 220);
    module.setConfig('layout.containmentPolicy', 'strict');

    expect(module.getConfig('layout.spacing.node')).toBe(180);
    expect(module.getThemeConfig()).toHaveProperty('theme.mode');
    expect(module.getLayoutConfig()).toHaveProperty('layout.spacing.node', 180);
    expect(module.getPerformanceConfig()).toHaveProperty('performance.maxNodes');
    expect(module.getExportConfig()).toHaveProperty('export.defaultFormat');

    const listener = vi.fn();
    module.onConfigChange('layout.rankMode', listener);
    module.setConfig('layout.rankMode', 'dagre_like');
    expect(listener).toHaveBeenCalled();

    expect(module.createDiagramConfig()).toMatchObject({
      NODE_WIDTH: 200,
      NODE_HEIGHT: 80,
      SPACING: { H: 180, V: 220 },
      containmentPolicy: 'strict',
      rankMode: 'dagre_like',
    });
  });
});
