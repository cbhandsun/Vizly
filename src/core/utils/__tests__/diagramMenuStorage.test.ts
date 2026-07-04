import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    coerceCollapsedGroups,
    coerceMenuScrollTop,
    DIAGRAM_MENU_COLLAPSED_GROUPS_KEY,
    DIAGRAM_MENU_SCROLL_TOP_KEY,
    readCollapsedGroups,
    readMenuScrollTop,
    writeCollapsedGroups,
    writeMenuScrollTop,
} from '../diagramMenuStorage';

const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
    safeLog: safeLogState,
}));

describe('diagramMenuStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        Object.values(safeLogState).forEach((mock) => mock.mockReset());
    });

    it('coerces collapsed groups to safe boolean records', () => {
        const result = coerceCollapsedGroups({
            architecture: true,
            logistics: false,
            invalid: 'yes',
            '<script>': true,
            ['x'.repeat(81)]: true,
        });

        expect(result).toEqual({
            architecture: true,
            logistics: false,
        });
    });

    it('falls back when collapsed groups are missing, malformed, or empty after coercion', () => {
        expect(readCollapsedGroups({ debug: true })).toEqual({ debug: true });

        localStorage.setItem(DIAGRAM_MENU_COLLAPSED_GROUPS_KEY, '{bad');
        expect(readCollapsedGroups({ debug: true })).toEqual({ debug: true });
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[diagramMenuStorage.readCollapsedGroups] Failed to read "diagramMenu.collapsedGroups":',
            expect.anything()
        );

        localStorage.setItem(DIAGRAM_MENU_COLLAPSED_GROUPS_KEY, JSON.stringify({ debug: 'true' }));
        expect(readCollapsedGroups({ debug: true })).toEqual({ debug: true });
    });

    it('writes only normalized collapsed groups', () => {
        const normalized = writeCollapsedGroups({
            valid: true,
            unsafe: 'true' as unknown as boolean,
        });

        expect(normalized).toEqual({ valid: true });
        expect(JSON.parse(localStorage.getItem(DIAGRAM_MENU_COLLAPSED_GROUPS_KEY) || '{}')).toEqual({ valid: true });
    });

    it('coerces scroll positions to bounded integers', () => {
        expect(coerceMenuScrollTop('10.7')).toBe(11);
        expect(coerceMenuScrollTop(0)).toBe(0);
        expect(coerceMenuScrollTop(-1)).toBeNull();
        expect(coerceMenuScrollTop(Number.POSITIVE_INFINITY)).toBeNull();
        expect(coerceMenuScrollTop(1_000_001)).toBeNull();
    });

    it('reads and writes scroll positions safely', () => {
        expect(writeMenuScrollTop(123.4)).toBe(123);
        expect(localStorage.getItem(DIAGRAM_MENU_SCROLL_TOP_KEY)).toBe('123');
        expect(readMenuScrollTop()).toBe(123);

        localStorage.setItem(DIAGRAM_MENU_SCROLL_TOP_KEY, 'bad');
        expect(readMenuScrollTop()).toBeNull();
    });

    it('ignores oversized collapsed groups payloads', () => {
        localStorage.setItem(DIAGRAM_MENU_COLLAPSED_GROUPS_KEY, 'x'.repeat(2 * 1024 * 1024 + 1));
        expect(readCollapsedGroups({ debug: true })).toEqual({ debug: true });
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[diagramMenuStorage.readCollapsedGroups] Failed to read "diagramMenu.collapsedGroups":',
            expect.anything()
        );
    });
});
