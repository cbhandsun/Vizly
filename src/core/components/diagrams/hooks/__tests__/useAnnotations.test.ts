import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('../../../../utils/consoleCleanup', () => ({
    safeLog: safeLogState,
}));

import { coerceAnnotations, useAnnotations } from '../useAnnotations';

describe('useAnnotations security coercion', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        Object.values(safeLogState).forEach(mock => mock.mockReset());
        vi.restoreAllMocks();
    });

    it('filters malformed annotations and strips unsafe shapes', () => {
        const annotations = coerceAnnotations(JSON.parse(`[
            {
                "id": "ann-1",
                "text": "ok",
                "x": 10,
                "y": 20,
                "color": "#60a5fa",
                "resolved": true,
                "createdAt": 123,
                "constructor": { "polluted": true }
            },
            { "id": "ann-1", "text": "duplicate", "x": 30, "y": 40 },
            { "id": "bad-x", "text": "bad", "x": "NaN", "y": 1 },
            { "id": "", "text": "bad", "x": 1, "y": 1 }
        ]`));

        expect(annotations).toEqual([{
            id: 'ann-1',
            text: 'ok',
            x: 10,
            y: 20,
            color: '#60a5fa',
            resolved: true,
            createdAt: 123,
        }]);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('bounds text, color, coordinates, and timestamps', () => {
        const annotations = coerceAnnotations([{
            id: 'ann-2',
            text: 'x'.repeat(5000),
            x: 1_000_000,
            y: -1_000_000,
            color: 'url(javascript:alert(1))',
            resolved: false,
            createdAt: -10,
        }]);

        expect(annotations).toHaveLength(1);
        expect(annotations[0].text).toHaveLength(4000);
        expect(annotations[0].color).toBe('#facc15');
        expect(annotations[0].createdAt).toBe(0);
    });

    it('rejects non-array payloads', () => {
        expect(coerceAnnotations({ id: 'ann' })).toEqual([]);
        expect(coerceAnnotations(null)).toEqual([]);
    });

    it('logs and falls back when annotation storage read throws', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('Authorization: Bearer annotation-read-secret');
        });

        const { result } = renderHook(() => useAnnotations());

        await waitFor(() => {
            expect(result.current.annotations).toEqual([]);
        });

        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[useAnnotations.loadAnnotations] Failed to read "diagram-annotations":',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('annotation-read-secret');
    });

    it('logs and falls back when annotation storage JSON is malformed', async () => {
        localStorage.setItem('diagram-annotations', '{broken');

        const { result } = renderHook(() => useAnnotations());

        await waitFor(() => {
            expect(result.current.annotations).toEqual([]);
        });

        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[useAnnotations.loadAnnotations] Failed to read "diagram-annotations":',
            expect.anything()
        );
    });

    it('logs and keeps UI state when annotation storage write throws', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('cookie=annotation-write-secret');
        });

        const { result } = renderHook(() => useAnnotations());

        act(() => {
            result.current.addAnnotation(10, 20, 'hello');
        });

        await waitFor(() => {
            expect(result.current.annotations).toHaveLength(1);
        });

        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[useAnnotations.persistAnnotations] Failed to write "diagram-annotations":',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('annotation-write-secret');
    });

    it('falls back when annotation storage payload is oversized', async () => {
        localStorage.setItem('diagram-annotations', 'x'.repeat(2 * 1024 * 1024 + 1));

        const { result } = renderHook(() => useAnnotations());

        await waitFor(() => {
            expect(result.current.annotations).toEqual([]);
        });

        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[useAnnotations.loadAnnotations] Failed to read "diagram-annotations":',
            expect.anything()
        );
    });
});
