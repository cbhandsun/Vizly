import type { CSSProperties } from 'react';

export const MOBILE_DRAWER_DOCK_CLEARANCE = 'calc(88px + env(safe-area-inset-bottom, 0px))';

export const createIconRailDrawerStyle = (
  isMobile: boolean,
  drawerWidth: number,
): CSSProperties => {
  if (!isMobile) {
    return {
      width: drawerWidth,
      height: 'calc(100% - 96px)',
      top: 80,
      bottom: 'auto',
      borderRadius: 'var(--designer-radius, 10px)',
    };
  }

  return {
    width: 'auto',
    minWidth: 0,
    maxWidth: 'none',
    height: 'min(64vh, calc(100% - 176px))',
    maxHeight: 'calc(100% - 176px)',
    top: 'auto',
    right: 12,
    bottom: MOBILE_DRAWER_DOCK_CLEARANCE,
    left: 12,
    borderRadius: 20,
  };
};
