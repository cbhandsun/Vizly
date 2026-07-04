import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TMS_LAYOUT_CONFIG, TmsLayoutConfigManager } from '../TmsLayoutConfig';

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

describe('TmsLayoutConfigManager', () => {
  let manager: TmsLayoutConfigManager;

  beforeEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
    manager = TmsLayoutConfigManager.getInstance();
    manager.resetToDefault();
  });

  it('returns defensive copies of nested config sections', () => {
    const config = manager.getConfig();
    config.MAIN_FLOW.SPACING_H = 999;
    config.SUPPORT.OFFSET_Y = 999;

    expect(manager.getConfig().MAIN_FLOW.SPACING_H).toBe(DEFAULT_TMS_LAYOUT_CONFIG.MAIN_FLOW.SPACING_H);
    expect(manager.getConfig().SUPPORT.OFFSET_Y).toBe(DEFAULT_TMS_LAYOUT_CONFIG.SUPPORT.OFFSET_Y);
  });

  it('updates partial config only after the merged config validates', () => {
    manager.updateConfig({
      MAIN_FLOW: {
        ...DEFAULT_TMS_LAYOUT_CONFIG.MAIN_FLOW,
        SPACING_H: 420,
      },
    });
    expect(manager.getConfig().MAIN_FLOW.SPACING_H).toBe(420);

    expect(() => manager.updateConfig({
      MAIN_FLOW: {
        ...DEFAULT_TMS_LAYOUT_CONFIG.MAIN_FLOW,
        SPACING_H: Number.POSITIVE_INFINITY,
      },
    })).toThrow('Invalid MAIN_FLOW.SPACING_H value');

    expect(manager.getConfig().MAIN_FLOW.SPACING_H).toBe(420);
  });

  it('imports valid complete config and rejects malformed or unsafe numbers', () => {
    const validConfig = {
      MAIN_FLOW: {
        SPACING_H: 400,
        SPACING_V: 180,
        START_X: 120,
        START_Y: 240,
      },
      SUPPORT: {
        OFFSET_Y: 260,
        SPACING_H: 260,
      },
      EXTERNAL: {
        TOP_Y: 40,
        BOTTOM_Y: 620,
      },
    };

    expect(manager.importConfig(JSON.stringify(validConfig))).toBe(true);
    expect(manager.getConfig()).toEqual(validConfig);

    expect(manager.importConfig(JSON.stringify({
      ...validConfig,
      MAIN_FLOW: { ...validConfig.MAIN_FLOW, SPACING_H: 0 },
    }))).toBe(false);
    expect(manager.getConfig()).toEqual(validConfig);

    expect(manager.importConfig(JSON.stringify({
      ...validConfig,
      EXTERNAL: { ...validConfig.EXTERNAL, BOTTOM_Y: 10001 },
    }))).toBe(false);
    expect(manager.getConfig()).toEqual(validConfig);

    expect(manager.importConfig(JSON.stringify(['MAIN_FLOW']))).toBe(false);
    expect(manager.importConfig('{broken')).toBe(false);
  });

  it('redacts sensitive parser failures before logging', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new Error('Authorization: Bearer tms-secret');
    });

    expect(manager.importConfig('{}')).toBe(false);

    const payload = JSON.stringify(safeLogState.error.mock.calls);
    expect(payload).toContain('Failed to import TMS layout config:');
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('tms-secret');
  });

  it('rejects oversized JSON payloads', () => {
    expect(manager.importConfig('x'.repeat(2 * 1024 * 1024 + 1))).toBe(false);
    expect(safeLogState.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to import TMS layout config:'),
      expect.anything()
    );
  });
});
