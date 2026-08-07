// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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
import {
  resolveIconRailRequestedPanel,
  shouldAutoOpenShapesPanel,
} from '../iconRailSidebarState';
import {
  createIconRailDrawerStyle,
  MOBILE_DRAWER_DOCK_CLEARANCE,
} from '../iconRailSidebarLayout';

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

  it('auto-opens built-in shapes for a first desktop blank canvas', () => {
    expect(shouldAutoOpenShapesPanel({
      activePanel: null,
      alreadyAutoOpened: false,
      isMobile: false,
      nodeCount: 0,
    })).toBe(true);
  });

  it('does not reopen shapes after dismissal, on mobile, or with content', () => {
    expect(shouldAutoOpenShapesPanel({
      activePanel: null,
      alreadyAutoOpened: false,
      enabled: false,
      isMobile: false,
      nodeCount: 0,
    })).toBe(false);
    expect(shouldAutoOpenShapesPanel({
      activePanel: null,
      alreadyAutoOpened: true,
      isMobile: false,
      nodeCount: 0,
    })).toBe(false);
    expect(shouldAutoOpenShapesPanel({
      activePanel: null,
      alreadyAutoOpened: false,
      isMobile: true,
      nodeCount: 0,
    })).toBe(false);
    expect(shouldAutoOpenShapesPanel({
      activePanel: null,
      alreadyAutoOpened: false,
      isMobile: false,
      nodeCount: 1,
    })).toBe(false);
  });

  it('resolves explicit mobile open and close requests', () => {
    expect(resolveIconRailRequestedPanel('shapes')).toBe('shapes');
    expect(resolveIconRailRequestedPanel('layers')).toBe('layers');
    expect(resolveIconRailRequestedPanel('close')).toBeNull();
  });

  it('keeps the mobile drawer inside the viewport and above the bottom dock', () => {
    expect(createIconRailDrawerStyle(true, 320)).toMatchObject({
      width: 'auto',
      minWidth: 0,
      maxWidth: 'none',
      left: 12,
      right: 12,
      bottom: MOBILE_DRAWER_DOCK_CLEARANCE,
      maxHeight: 'calc(100% - 176px)',
    });
  });

  it('preserves the desktop drawer geometry', () => {
    expect(createIconRailDrawerStyle(false, 320)).toMatchObject({
      width: 320,
      height: 'calc(100% - 96px)',
      top: 80,
      bottom: 'auto',
      borderRadius: 'var(--designer-radius, 10px)',
    });
  });

  it('uses an opaque mobile drawer surface so the canvas and icon rail cannot bleed through', () => {
    const css = readFileSync(
      'src/core/components/diagrams/IconRailSidebar.css',
      'utf8',
    );

    expect(css).toMatch(
      /\.side-drawer\.mobile-drawer\s*\{[^}]*background:\s*#fff;[^}]*backdrop-filter:\s*none;[^}]*-webkit-backdrop-filter:\s*none;/s,
    );
    expect(css).toMatch(
      /\[data-theme='dark'\] \.side-drawer\.mobile-drawer\s*\{[^}]*background:\s*#1e1e2e;/s,
    );
  });
});
