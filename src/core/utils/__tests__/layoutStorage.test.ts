import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    coerceBoundedInteger,
    DESIGNER_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY,
    DESIGNER_RIGHT_SIDEBAR_VISIBLE_STORAGE_KEY,
    DESIGNER_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
    FLOW_SIDEBAR_WIDTH_MAX,
    FLOW_SIDEBAR_WIDTH_MIN,
    LAYOUT_FLOW_SIDEBAR_WIDTH_STORAGE_KEY,
    LAYOUT_MENU_WIDTH_STORAGE_KEY,
    MENU_WIDTH_MAX,
    MENU_WIDTH_MIN,
    readDesignerRightSidebarCollapsed,
    readDesignerRightSidebarVisible,
    readDesignerRightSidebarWidth,
    readLayoutFlowSidebarWidth,
    readLayoutMenuWidth,
    RIGHT_SIDEBAR_WIDTH_MAX,
    RIGHT_SIDEBAR_WIDTH_MIN,
    writeDesignerRightSidebarCollapsed,
    writeDesignerRightSidebarWidth,
    writeLayoutFlowSidebarWidth,
    writeLayoutMenuWidth,
} from '../layoutStorage';

describe('layoutStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('coerces bounded integers from numbers and strings', () => {
        expect(coerceBoundedInteger('10.6', 5, 0, 100)).toBe(11);
        expect(coerceBoundedInteger(Number.POSITIVE_INFINITY, 5, 0, 100)).toBe(5);
        expect(coerceBoundedInteger('bad', 5, 0, 100)).toBe(5);
        expect(coerceBoundedInteger(-100, 5, 0, 100)).toBe(0);
        expect(coerceBoundedInteger(200, 5, 0, 100)).toBe(100);
    });

    it('reads layout widths with configured bounds', () => {
        localStorage.setItem(LAYOUT_MENU_WIDTH_STORAGE_KEY, '99999');
        localStorage.setItem(LAYOUT_FLOW_SIDEBAR_WIDTH_STORAGE_KEY, '-1');
        localStorage.setItem(DESIGNER_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, 'bad');

        expect(readLayoutMenuWidth()).toBe(MENU_WIDTH_MAX);
        expect(readLayoutFlowSidebarWidth()).toBe(FLOW_SIDEBAR_WIDTH_MIN);
        expect(readDesignerRightSidebarWidth()).toBe(360);
    });

    it('writes normalized layout widths', () => {
        expect(writeLayoutMenuWidth(1)).toBe(MENU_WIDTH_MIN);
        expect(localStorage.getItem(LAYOUT_MENU_WIDTH_STORAGE_KEY)).toBe(String(MENU_WIDTH_MIN));

        expect(writeLayoutFlowSidebarWidth(9999)).toBe(FLOW_SIDEBAR_WIDTH_MAX);
        expect(localStorage.getItem(LAYOUT_FLOW_SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(FLOW_SIDEBAR_WIDTH_MAX));

        expect(writeDesignerRightSidebarWidth(9999)).toBe(RIGHT_SIDEBAR_WIDTH_MAX);
        expect(localStorage.getItem(DESIGNER_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(RIGHT_SIDEBAR_WIDTH_MAX));
        expect(writeDesignerRightSidebarWidth(1)).toBe(RIGHT_SIDEBAR_WIDTH_MIN);
    });

    it('reads and writes right sidebar collapsed/visible flags defensively', () => {
        expect(readDesignerRightSidebarCollapsed()).toBe(false);
        writeDesignerRightSidebarCollapsed(true);
        expect(localStorage.getItem(DESIGNER_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('true');
        expect(readDesignerRightSidebarCollapsed()).toBe(true);

        expect(readDesignerRightSidebarVisible()).toBe(true);
        localStorage.setItem(DESIGNER_RIGHT_SIDEBAR_VISIBLE_STORAGE_KEY, 'false');
        expect(readDesignerRightSidebarVisible()).toBe(false);
        localStorage.setItem(DESIGNER_RIGHT_SIDEBAR_VISIBLE_STORAGE_KEY, 'bad');
        expect(readDesignerRightSidebarVisible()).toBe(true);
    });
});
