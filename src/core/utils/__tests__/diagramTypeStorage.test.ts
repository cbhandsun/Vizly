import { describe, expect, it } from 'vitest';
import {
    coerceDiagramConfigIndex,
    getDiagramDocTypeFromStorage,
    readDiagramConfigIndex,
    upsertDiagramConfigIndex,
} from '../diagramTypeStorage';

const makeStorage = (entries: Record<string, string | null>) => ({
    getItem: (key: string) => entries[key] ?? null,
} as Storage);

describe('getDiagramDocTypeFromStorage', () => {
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
});
