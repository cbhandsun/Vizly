// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

import {
  ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY,
  persistIconRailDrawerWidth,
  readIconRailDrawerWidth,
} from '../iconRailSidebarStorage';

describe('IconRailSidebar storage helpers', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    localStorage.clear();
  });

  it('reads a valid persisted drawer width', () => {
    localStorage.setItem(ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, '320');
    expect(readIconRailDrawerWidth()).toBe(320);
  });

  it('falls back for invalid persisted drawer widths', () => {
    localStorage.setItem(ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, '900');
    expect(readIconRailDrawerWidth()).toBe(280);

    localStorage.setItem(ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, 'NaN');
    expect(readIconRailDrawerWidth()).toBe(280);
  });

  it('logs and falls back when drawer width read fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('token=sidebar-read-secret');
    });

    expect(readIconRailDrawerWidth()).toBe(280);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[IconRailSidebar.readDrawerWidth] Failed to read "designer.sidebar.drawerWidth":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('sidebar-read-secret');
  });

  it('logs and keeps going when drawer width write fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer sidebar-write-secret');
    });

    expect(() => persistIconRailDrawerWidth(300)).not.toThrow();
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[IconRailSidebar.persistDrawerWidth] Failed to write "designer.sidebar.drawerWidth":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('sidebar-write-secret');
  });
});
