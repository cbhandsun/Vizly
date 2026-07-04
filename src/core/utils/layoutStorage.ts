import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

export const LAYOUT_MENU_WIDTH_STORAGE_KEY = 'layout.menuWidth';
export const LAYOUT_FLOW_SIDEBAR_WIDTH_STORAGE_KEY = 'layout.flowSidebarWidth';
export const DESIGNER_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = 'designer.rightSidebar.width';
export const DESIGNER_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY = 'designer.rightSidebar.collapsed';
export const DESIGNER_RIGHT_SIDEBAR_VISIBLE_STORAGE_KEY = 'designer.rightSidebar.visible';

export const MENU_WIDTH_DEFAULT = 304;
export const MENU_WIDTH_MIN = 220;
export const MENU_WIDTH_MAX = 520;
export const FLOW_SIDEBAR_WIDTH_DEFAULT = 260;
export const FLOW_SIDEBAR_WIDTH_MIN = 200;
export const FLOW_SIDEBAR_WIDTH_MAX = 520;
export const RIGHT_SIDEBAR_WIDTH_DEFAULT = 360;
export const RIGHT_SIDEBAR_WIDTH_MIN = 280;
export const RIGHT_SIDEBAR_WIDTH_MAX = 800;

export const coerceBoundedInteger = (
    value: unknown,
    fallback: number,
    min: number,
    max: number
): number => {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
};

const readBoundedInteger = (key: string, fallback: number, min: number, max: number): number => {
    try {
        return coerceBoundedInteger(localStorage.getItem(key), fallback, min, max);
    } catch (error) {
        logUiStorageReadFailure('layoutStorage', key, error);
        return fallback;
    }
};

const writeBoundedInteger = (key: string, value: number, fallback: number, min: number, max: number): number => {
    const normalized = coerceBoundedInteger(value, fallback, min, max);
    try {
        localStorage.setItem(key, String(normalized));
    } catch (error) {
        logUiStorageWriteFailure('layoutStorage', key, error);
    }
    return normalized;
};

export const readLayoutMenuWidth = (): number =>
    readBoundedInteger(LAYOUT_MENU_WIDTH_STORAGE_KEY, MENU_WIDTH_DEFAULT, MENU_WIDTH_MIN, MENU_WIDTH_MAX);

export const writeLayoutMenuWidth = (value: number): number =>
    writeBoundedInteger(LAYOUT_MENU_WIDTH_STORAGE_KEY, value, MENU_WIDTH_DEFAULT, MENU_WIDTH_MIN, MENU_WIDTH_MAX);

export const readLayoutFlowSidebarWidth = (): number =>
    readBoundedInteger(LAYOUT_FLOW_SIDEBAR_WIDTH_STORAGE_KEY, FLOW_SIDEBAR_WIDTH_DEFAULT, FLOW_SIDEBAR_WIDTH_MIN, FLOW_SIDEBAR_WIDTH_MAX);

export const writeLayoutFlowSidebarWidth = (value: number): number =>
    writeBoundedInteger(LAYOUT_FLOW_SIDEBAR_WIDTH_STORAGE_KEY, value, FLOW_SIDEBAR_WIDTH_DEFAULT, FLOW_SIDEBAR_WIDTH_MIN, FLOW_SIDEBAR_WIDTH_MAX);

export const readDesignerRightSidebarWidth = (): number =>
    readBoundedInteger(DESIGNER_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, RIGHT_SIDEBAR_WIDTH_DEFAULT, RIGHT_SIDEBAR_WIDTH_MIN, RIGHT_SIDEBAR_WIDTH_MAX);

export const writeDesignerRightSidebarWidth = (value: number): number =>
    writeBoundedInteger(DESIGNER_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, value, RIGHT_SIDEBAR_WIDTH_DEFAULT, RIGHT_SIDEBAR_WIDTH_MIN, RIGHT_SIDEBAR_WIDTH_MAX);

export const readDesignerRightSidebarCollapsed = (): boolean => {
    try {
        return localStorage.getItem(DESIGNER_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch (error) {
        logUiStorageReadFailure('layoutStorage', DESIGNER_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY, error);
        return false;
    }
};

export const writeDesignerRightSidebarCollapsed = (value: boolean): void => {
    try {
        localStorage.setItem(DESIGNER_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
    } catch (error) {
        logUiStorageWriteFailure('layoutStorage', DESIGNER_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY, error);
    }
};

export const readDesignerRightSidebarVisible = (): boolean => {
    try {
        return localStorage.getItem(DESIGNER_RIGHT_SIDEBAR_VISIBLE_STORAGE_KEY) !== 'false';
    } catch (error) {
        logUiStorageReadFailure('layoutStorage', DESIGNER_RIGHT_SIDEBAR_VISIBLE_STORAGE_KEY, error);
        return true;
    }
};
