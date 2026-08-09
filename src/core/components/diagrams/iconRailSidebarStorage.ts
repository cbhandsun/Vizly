import { logUiStorageReadFailure, logUiStorageWriteFailure } from '@/core/utils/uiStorageLogging';

export const ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY = 'designer.sidebar.drawerWidth';
export const ICON_RAIL_DRAWER_MIN_WIDTH = 240;
export const ICON_RAIL_DRAWER_MAX_WIDTH = 400;
export const ICON_RAIL_DRAWER_DEFAULT_WIDTH = 280;

export const readIconRailDrawerWidth = (): number => {
  try {
    const value = Number(localStorage.getItem(ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY));
    return Number.isFinite(value)
      && value >= ICON_RAIL_DRAWER_MIN_WIDTH
      && value <= ICON_RAIL_DRAWER_MAX_WIDTH
      ? value
      : ICON_RAIL_DRAWER_DEFAULT_WIDTH;
  } catch (error) {
    logUiStorageReadFailure('IconRailSidebar.readDrawerWidth', ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, error);
    return ICON_RAIL_DRAWER_DEFAULT_WIDTH;
  }
};

export const persistIconRailDrawerWidth = (drawerWidth: number): void => {
  try {
    localStorage.setItem(ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, String(drawerWidth));
  } catch (error) {
    logUiStorageWriteFailure('IconRailSidebar.persistDrawerWidth', ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, error);
  }
};

export const clampIconRailDrawerWidth = (drawerWidth: number): number => {
  const finiteWidth = Number.isFinite(drawerWidth)
    ? drawerWidth
    : ICON_RAIL_DRAWER_DEFAULT_WIDTH;
  return Math.max(
    ICON_RAIL_DRAWER_MIN_WIDTH,
    Math.min(ICON_RAIL_DRAWER_MAX_WIDTH, finiteWidth),
  );
};
