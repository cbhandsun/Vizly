import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    coerceDiagramConfigIndex,
    getDiagramDocTypeFromStorage,
    readDiagramConfigIndex,
    upsertDiagramConfigIndex,
} from '../diagramTypeStorage';

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

const makeStorage = (entries: Record<string, string | null>) => ({
    getItem: (key: string) => entries[key] ?? null,
} as Storage);

describe('getDiagramDocTypeFromStorage', () => {
    afterEach(() => {
        Object.values(safeLogState).forEach((mock) => mock.mockReset());
        vi.restoreAllMocks();
    });

    it('reads type from legacy diagram array storage', () => {
        const storage = makeStorage({
            vizly_diagrams: JSON.stringify([{ id: 'a', type: 'mindmap' }]),
        });

        expect(getDiagramDocTypeFromStorage(storage, 'a')).toBe('mindmap');
    });

    it('falls back through config index and autosave metadata', () => {
        expect(getDiagramDocTypeFromStorage(makeStorage({
            vizly_diagram_configs: JSON.stringify({ flow: { type: 'flowchart' } }),
        }), 'flow')).toBe('flowchart');

        expect(getDiagramDocTypeFromStorage(makeStorage({
            'flowchart-autosave-v2-timeline': JSON.stringify({ metadata: { type: 'timeline' } }),
        }), 'timeline')).toBe('timeline');
    });

    it('ignores malformed or wrong-shaped storage without throwing', () => {
        const storage = makeStorage({
            vizly_diagrams: '{broken',
            vizly_diagram_configs: JSON.stringify([]),
            'flowchart-autosave-v2-a': JSON.stringify({ metadata: [] }),
        });

        expect(getDiagramDocTypeFromStorage(storage, 'a')).toBeUndefined();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[diagramTypeStorage] Failed to read "vizly_diagrams":',
            expect.anything()
        );
    });
});

describe('diagram config index storage', () => {
    it('coerces polluted config indexes and bounds persisted fields', () => {
        const configs = coerceDiagramConfigIndex({
            '__proto__': { id: 'bad', type: 'flowchart' },
            missingType: { id: 'missing-type' },
            valid: {
                id: 'diagram-a',
                type: 'flowchart',
                name: 'x'.repeat(300),
                updatedAt: -1,
                extra: { ignored: true },
            },
            fallbackKey: {
                type: 'mindmap',
                name: 'Mind Map',
                updatedAt: 42,
            },
        });

        expect(configs['diagram-a']).toEqual({
            id: 'diagram-a',
            type: 'flowchart',
            name: 'x'.repeat(240),
            updatedAt: undefined,
        });
        expect(configs.fallbackKey).toEqual({
            id: 'fallbackKey',
            type: 'mindmap',
            name: 'Mind Map',
            updatedAt: 42,
        });
        expect(Object.prototype).not.toHaveProperty('bad');
    });

    it('repairs malformed storage when upserting a diagram config', () => {
        localStorage.setItem('vizly_diagram_configs', '{broken');

        upsertDiagramConfigIndex(localStorage, {
            id: 'diagram-a',
            type: 'flowchart',
            name: 'A',
            updatedAt: 123,
        });

        expect(readDiagramConfigIndex(localStorage)).toEqual({
            'diagram-a': {
                id: 'diagram-a',
                type: 'flowchart',
                name: 'A',
                updatedAt: 123,
            },
        });
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[diagramTypeStorage] Failed to read "vizly_diagram_configs":',
            expect.anything()
        );
    });

    it('keeps only recent bounded config entries', () => {
        const raw = Object.fromEntries(Array.from({ length: 1005 }, (_, index) => [
            `diagram-${index}`,
            { type: 'flowchart', name: `Diagram ${index}`, updatedAt: index },
        ]));

        const configs = coerceDiagramConfigIndex(raw);

        expect(Object.keys(configs)).toHaveLength(1000);
        expect(configs['diagram-0']).toBeUndefined();
        expect(configs['diagram-5']).toBeDefined();
        expect(configs['diagram-1004']).toBeDefined();
    });

    it('falls back to empty diagram config index when storage payload is oversized', () => {
        localStorage.setItem('vizly_diagram_configs', '{'.repeat(2 * 1024 * 1024 + 1));

        expect(readDiagramConfigIndex(localStorage)).toEqual({});
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[diagramTypeStorage] Failed to read "vizly_diagram_configs":',
            expect.anything()
        );
    });

    it('handles storage read/write failures without throwing', () => {
        const throwingStorage = {
            getItem: () => {
                throw new Error('storage unavailable');
            },
            setItem: () => {
                throw new Error('storage blocked');
            },
        } as unknown as Storage;

        expect(readDiagramConfigIndex(throwingStorage)).toEqual({});
        expect(getDiagramDocTypeFromStorage(throwingStorage, 'diagram-a')).toBeUndefined();
        expect(() => upsertDiagramConfigIndex(throwingStorage, {
            id: 'diagram-a',
            type: 'flowchart',
        })).not.toThrow();
    });

    it('logs the autosave key when autosave JSON is malformed', () => {
        const storage = makeStorage({
            'flowchart-autosave-v2-diagram-a': '{broken',
        });

        expect(getDiagramDocTypeFromStorage(storage, 'diagram-a')).toBeUndefined();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[diagramTypeStorage] Failed to read "flowchart-autosave-v2-diagram-a":',
            expect.anything()
        );
    });
});
