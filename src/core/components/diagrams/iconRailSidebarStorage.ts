import { logUiStorageReadFailure, logUiStorageWriteFailure } from '@/core/utils/uiStorageLogging';

export const ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY = 'designer.sidebar.drawerWidth';
const MIN_DRAWER_WIDTH = 240;
const MAX_DRAWER_WIDTH = 400;
const DEFAULT_DRAWER_WIDTH = 280;

export const readIconRailDrawerWidth = (): number => {
  try {
    const value = Number(localStorage.getItem(ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) && value >= MIN_DRAWER_WIDTH && value <= MAX_DRAWER_WIDTH
      ? value
      : DEFAULT_DRAWER_WIDTH;
  } catch (error) {
    logUiStorageReadFailure('IconRailSidebar.readDrawerWidth', ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, error);
    return DEFAULT_DRAWER_WIDTH;
  }
};

export const persistIconRailDrawerWidth = (drawerWidth: number): void => {
  try {
    localStorage.setItem(ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, String(drawerWidth));
  } catch (error) {
    logUiStorageWriteFailure('IconRailSidebar.persistDrawerWidth', ICON_RAIL_DRAWER_WIDTH_STORAGE_KEY, error);
  }
};

export const clampIconRailDrawerWidth = (drawerWidth: number): number => (
  Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, drawerWidth))
);
