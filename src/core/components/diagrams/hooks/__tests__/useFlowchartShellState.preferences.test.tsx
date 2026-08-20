// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { BackgroundVariant } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/core/utils/consoleCleanup', () => ({
    safeLog: { warn },
}));

import {
    FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY,
    coerceFlowchartCanvasPreferences,
    parseFlowchartCanvasPreferences,
    readFlowchartCanvasPreferences,
    writeFlowchartCanvasPreferences,
    type FlowchartCanvasPreferencesStorage,
} from '../../flowchartCanvasPreferences';
import {
    resolveFlowchartInitialCanvasPreferences,
    useFlowchartShellState,
} from '../useFlowchartShellState';

const persistedPreferences = {
    version: 1 as const,
    showGrid: false,
    gridVariant: 'cross' as const,
    showMinimap: false,
    showRuler: true,
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('flowchart canvas preference boundary', () => {
    beforeEach(() => {
        window.localStorage.clear();
        warn.mockReset();
    });

    it('parses valid persisted preferences and ignores unknown fields', () => {
        expect(parseFlowchartCanvasPreferences(JSON.stringify({
            ...persistedPreferences,
            futureField: 'ignored',
        }))).toEqual(persistedPreferences);
    });

    it.each([
        null,
        undefined,
        '',
        '   ',
        '{not-json',
        '[]',
        'null',
        JSON.stringify({ ...persistedPreferences, version: 2 }),
        JSON.stringify({ ...persistedPreferences, showGrid: 'yes' }),
        JSON.stringify({ ...persistedPreferences, gridVariant: 'mesh' }),
        JSON.stringify({ ...persistedPreferences, showMinimap: 1 }),
        JSON.stringify({ ...persistedPreferences, showRuler: null }),
        'x'.repeat(513),
    ])('rejects empty, malformed, incompatible, or extreme input %#', value => {
        expect(parseFlowchartCanvasPreferences(value)).toBeNull();
    });

    it('does not read inherited preference values or mutate object prototypes', () => {
        const hostile = Object.create(persistedPreferences) as unknown;
        expect(coerceFlowchartCanvasPreferences(hostile)).toBeNull();

        expect(coerceFlowchartCanvasPreferences({
            ...persistedPreferences,
            __proto__: { polluted: true },
        })).toEqual(persistedPreferences);
        expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it('reads and writes only the bounded preference record', () => {
        const storage: FlowchartCanvasPreferencesStorage = {
            getItem: vi.fn(() => JSON.stringify(persistedPreferences)),
            setItem: vi.fn(),
        };

        expect(readFlowchartCanvasPreferences(() => storage)).toEqual(persistedPreferences);
        expect(storage.getItem).toHaveBeenCalledWith(FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY);
        expect(writeFlowchartCanvasPreferences(persistedPreferences, () => storage)).toBe(true);
        expect(storage.setItem).toHaveBeenCalledWith(
            FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY,
            JSON.stringify(persistedPreferences),
        );
    });

    it('redacts storage failures and falls back without leaking stored values', () => {
        const failingStorage: FlowchartCanvasPreferencesStorage = {
            getItem: vi.fn(() => { throw new Error('cookie=canvas-secret'); }),
            setItem: vi.fn(() => { throw new Error('Bearer canvas-token'); }),
        };

        expect(readFlowchartCanvasPreferences(() => failingStorage)).toBeNull();
        expect(writeFlowchartCanvasPreferences(persistedPreferences, () => failingStorage)).toBe(false);
        expect(readFlowchartCanvasPreferences(() => null)).toBeNull();
        expect(writeFlowchartCanvasPreferences(persistedPreferences, () => null)).toBe(false);
        const payload = JSON.stringify(warn.mock.calls);
        expect(payload).toContain('[redacted]');
        expect(payload).not.toContain('canvas-secret');
        expect(payload).not.toContain('canvas-token');
    });
});

describe('useFlowchartShellState canvas preference lifecycle', () => {
    beforeEach(() => {
        window.localStorage.clear();
        warn.mockReset();
    });

    it('resolves persisted choices before theme defaults', () => {
        expect(resolveFlowchartInitialCanvasPreferences(
            { style: 'dots' },
            true,
            persistedPreferences,
        )).toEqual({
            showGrid: false,
            gridVariant: BackgroundVariant.Cross,
            showMinimap: false,
            showRuler: true,
        });

        expect(resolveFlowchartInitialCanvasPreferences(
            { style: 'dots' },
            false,
            null,
        )).toEqual({
            showGrid: true,
            gridVariant: BackgroundVariant.Dots,
            showMinimap: false,
            showRuler: false,
        });
    });

    it('hydrates persisted preferences and saves later user changes', async () => {
        window.localStorage.setItem(
            FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY,
            JSON.stringify(persistedPreferences),
        );
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const { result } = renderHook(() => useFlowchartShellState({ style: 'lines' }, true));

        expect(result.current.showGrid).toBe(false);
        expect(result.current.gridVariant).toBe(BackgroundVariant.Cross);
        expect(result.current.showMinimap).toBe(false);
        expect(result.current.showRuler).toBe(true);

        act(() => {
            result.current.setShowGrid(true);
            result.current.setGridVariant(BackgroundVariant.Dots);
            result.current.setShowMinimap(true);
            result.current.setShowRuler(false);
        });

        await waitFor(() => expect(setItem).toHaveBeenCalledWith(
            FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY,
            JSON.stringify({
                version: 1,
                showGrid: true,
                gridVariant: 'dots',
                showMinimap: true,
                showRuler: false,
            }),
        ));
    });

    it('uses the initial theme as fallback and applies later theme changes', async () => {
        const { result, rerender } = renderHook(
            ({ grid }) => useFlowchartShellState(grid, false),
            { initialProps: { grid: { style: 'dots' } as unknown } },
        );

        expect(result.current.showGrid).toBe(true);
        expect(result.current.gridVariant).toBe(BackgroundVariant.Dots);
        expect(result.current.showMinimap).toBe(false);

        rerender({ grid: { style: 'hidden' } });
        await waitFor(() => expect(result.current.showGrid).toBe(false));
        expect(JSON.parse(window.localStorage.getItem(
            FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY,
        ) ?? 'null')).toMatchObject({ showGrid: false, gridVariant: 'dots' });
    });
});
