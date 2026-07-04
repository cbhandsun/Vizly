import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramConfig } from '../DiagramConfig';

const STORAGE_KEY = 'architecture-diagram-config';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

const importFreshDiagramConfig = async () => {
  vi.resetModules();
  return import('../DiagramConfig');
};

describe('DiagramConfigManager', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('loads bounded persisted config, normalizes legacy marker size, and cleans invalid storage', async () => {
    const { DiagramConfigManager } = await importFreshDiagramConfig();

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      edge: {
        strokeWidth: 4,
        markerEnd: { type: 'arrowclosed', width: 99, height: 99 },
      },
      node: {
        gap: { horizontal: 1, vertical: 1 },
      },
    }));

    const manager = new DiagramConfigManager();
    manager.loadConfigFromStorage();

    expect(manager.getConfig().edge.strokeWidth).toBe(4);
    expect(manager.getConfig().edge.markerEnd).toMatchObject({ width: 10, height: 10 });
    expect(manager.getConfig().node.gap).toEqual({ horizontal: 48, vertical: 36 });

    localStorage.setItem(STORAGE_KEY, '{broken');
    manager.loadConfigFromStorage();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DiagramConfigManager.loadConfigFromStorage] Failed to read "architecture-diagram-config":',
      expect.anything()
    );
  });

  it('removes oversized persisted config instead of parsing it on startup', async () => {
    const { DiagramConfigManager } = await importFreshDiagramConfig();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ canvas: { background: 'x'.repeat(600 * 1024) } }));

    const manager = new DiagramConfigManager();
    manager.loadConfigFromStorage();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(manager.getConfig().canvas.background).toBe('#ffffff');
  });

  it('rejects malformed, wrong-shaped, and oversized imports without changing current config', async () => {
    const { DiagramConfigManager } = await importFreshDiagramConfig();
    const manager = new DiagramConfigManager();
    manager.updateConfig({ node: { height: 120 } } as any);

    expect(manager.importConfig('{broken')).toBe(false);
    expect(manager.importConfig(JSON.stringify(['edge.strokeWidth', 4]))).toBe(false);
    expect(manager.importConfig(JSON.stringify({ canvas: { background: 'x'.repeat(70 * 1024) } }))).toBe(false);
    expect(manager.importConfig('{"edge":{"strokeWidth":1e999}}')).toBe(false);

    expect(manager.getConfig().node.height).toBe(120);
  });

  it('strips dangerous keys from imported and directly updated nested config', async () => {
    const { DiagramConfigManager } = await importFreshDiagramConfig();
    const manager = new DiagramConfigManager();

    expect(manager.importConfig(`{
      "edge": {
        "handleWeights": {
          "safe": 1,
          "__proto__": { "polluted": true },
          "constructor": { "polluted": true }
        }
      }
    }`)).toBe(true);

    expect(manager.getConfig().edge.handleWeights.safe).toBe(1);
    expect(Object.hasOwn(manager.getConfig().edge.handleWeights, 'constructor')).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');

    manager.updateConfig({
      edge: {
        handleWeights: {
          allowed: 2,
          prototype: { polluted: true },
        },
      },
    } as any);

    expect(manager.getConfig().edge.handleWeights.allowed).toBe(2);
    expect(Object.hasOwn(manager.getConfig().edge.handleWeights, 'prototype')).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('skips persisting sanitized configs that exceed the storage limit', async () => {
    const { DiagramConfigManager } = await importFreshDiagramConfig();
    const manager = new DiagramConfigManager();

    manager.updateConfig({
      edge: {
        handleWeights: {
          large: Array.from({ length: 1000 }, () => 'x'.repeat(600)),
        },
      },
    } as unknown as Partial<DiagramConfig>);

    expect(manager.getConfig().edge.handleWeights?.large).toHaveLength(1000);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(safeLogState.warn).toHaveBeenCalledWith('图表配置超过本地存储大小限制，跳过保存');
  });

  it('redacts listener failures before logging', async () => {
    const { DiagramConfigManager } = await importFreshDiagramConfig();
    const manager = new DiagramConfigManager();

    manager.addConfigChangeListener(() => {
      throw new Error('api_key=diagram-secret');
    });

    manager.updateConfig({ node: { width: 220 } } as unknown as Partial<DiagramConfig>);

    const payload = JSON.stringify(safeLogState.error.mock.calls);
    expect(payload).toContain('配置变更监听器执行失败:');
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('diagram-secret');
  });

  it('redacts local storage write failures before warning', async () => {
    const { DiagramConfigManager } = await importFreshDiagramConfig();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer diagram-config-secret');
    });
    const manager = new DiagramConfigManager();

    manager.updateConfig({ node: { height: 120 } } as any);

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DiagramConfigManager.saveConfigToStorage] Failed to write "architecture-diagram-config":',
      expect.anything()
    );
    const payload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('diagram-config-secret');
    setItemSpy.mockRestore();
  });
});
