import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayeredConfigManager as LayeredConfigManagerType } from '../LayeredConfigManager';

const importFreshLayeredConfigManager = async () => {
  vi.resetModules();
  return import('../LayeredConfigManager');
};

describe('LayeredConfigManager', () => {
  let manager: LayeredConfigManagerType;
  let module: Awaited<ReturnType<typeof importFreshLayeredConfigManager>>;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    module = await importFreshLayeredConfigManager();
    manager = module.LayeredConfigManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('imports flat config atomically and ignores unknown keys', () => {
    manager.set('diagram.node.width', 210, module.ConfigLayer.USER);

    manager.importConfig(JSON.stringify({
      'diagram.node.width': 260,
      'unknown.key': 'ignored',
    }));
    expect(manager.get('diagram.node.width')).toBe(260);

    expect(() => manager.importConfig(JSON.stringify({
      'diagram.node.width': 1200,
      'diagram.node.height': 120,
    }))).toThrow('导入配置失败');
    expect(manager.get('diagram.node.width')).toBe(260);
    expect(manager.get('diagram.node.height')).toBe(60);

    expect(() => manager.importConfig(JSON.stringify({ 'unknown.key': true }))).toThrow('导入配置失败');
    expect(() => manager.importConfig(JSON.stringify(['diagram.node.width', 300]))).toThrow('导入配置失败');
  });

  it('imports layered config after all layers validate', () => {
    manager.importConfig(JSON.stringify({
      system: {},
      user: {
        'diagram.node.width': 240,
      },
      session: {
        'diagram.node.width': 280,
      },
      unknownLayer: {
        'diagram.node.width': 900,
      },
    }));

    expect(manager.getLayer(module.ConfigLayer.USER)).toHaveProperty('diagram.node.width', 240);
    expect(manager.getLayer(module.ConfigLayer.SESSION)).toHaveProperty('diagram.node.width', 280);
    expect(manager.get('diagram.node.width')).toBe(280);

    expect(() => manager.importConfig(JSON.stringify({
      user: {
        'diagram.node.width': 300,
      },
      session: {
        'diagram.node.height': 900,
      },
    }))).toThrow('导入配置失败');

    expect(manager.getLayer(module.ConfigLayer.USER)).toHaveProperty('diagram.node.width', 240);
    expect(manager.getLayer(module.ConfigLayer.SESSION)).toHaveProperty('diagram.node.width', 280);
    expect(manager.getLayer(module.ConfigLayer.SESSION)).not.toHaveProperty('diagram.node.height');
  });

  it('round-trips exported configs and rejects invalid target layers', () => {
    manager.set('diagram.spacing.horizontal', 180, module.ConfigLayer.USER);
    const exported = manager.exportConfig();

    manager.resetLayer(module.ConfigLayer.USER);
    expect(manager.get('diagram.spacing.horizontal')).toBe(100);

    manager.importConfig(exported);
    expect(manager.get('diagram.spacing.horizontal')).toBe(180);

    expect(() => manager.setMultiple({ 'diagram.node.width': 220 }, 'bad-layer' as never)).toThrow('无效的配置层');
  });

  it('validates persisted layer data before loading it', async () => {
    localStorage.setItem('layered-config-user', JSON.stringify({
      'diagram.node.width': 333,
      'diagram.node.height': 999,
      'unknown.key': 'ignored',
    }));

    module = await importFreshLayeredConfigManager();
    manager = module.LayeredConfigManager.getInstance();

    expect(manager.get('diagram.node.width')).toBe(333);
    expect(manager.get('diagram.node.height')).toBe(60);
    expect(manager.getLayer(module.ConfigLayer.USER)).not.toHaveProperty('unknown.key');
  });

  it('isolates corrupted persisted layers and still loads valid layers', async () => {
    localStorage.setItem('layered-config-global', '{broken');
    localStorage.setItem('layered-config-user', JSON.stringify({
      'diagram.node.width': 321,
    }));
    sessionStorage.setItem('layered-config-session', JSON.stringify({
      'diagram.node.height': 123,
    }));

    module = await importFreshLayeredConfigManager();
    manager = module.LayeredConfigManager.getInstance();

    expect(localStorage.getItem('layered-config-global')).toBeNull();
    expect(manager.get('diagram.node.width')).toBe(321);
    expect(manager.get('diagram.node.height')).toBe(123);
  });

  it('removes oversized persisted layers before parsing', async () => {
    localStorage.setItem('layered-config-user', JSON.stringify({
      'diagram.node.width': 222,
      padding: 'x'.repeat(256 * 1024),
    }));

    module = await importFreshLayeredConfigManager();
    manager = module.LayeredConfigManager.getInstance();

    expect(localStorage.getItem('layered-config-user')).toBeNull();
    expect(manager.get('diagram.node.width')).toBe(200);
  });

  it('ignores invalid cloud layer payloads without blocking later valid rows', async () => {
    const adapter = {
      syncWithCloud: vi.fn(async (onConfigLoaded: (key: string, value: any) => void) => {
        onConfigLoaded('layered-config-user', null);
        onConfigLoaded('layered-config-user', {
          'diagram.node.width': 277,
          'diagram.node.height': 999,
          'unknown.key': true,
        });
      }),
      saveConfig: vi.fn(),
    };

    manager.setCloudAdapter(adapter);
    await manager.syncWithCloud();

    expect(manager.get('diagram.node.width')).toBe(277);
    expect(manager.get('diagram.node.height')).toBe(60);
    expect(manager.getLayer(module.ConfigLayer.USER)).not.toHaveProperty('unknown.key');
  });
});
