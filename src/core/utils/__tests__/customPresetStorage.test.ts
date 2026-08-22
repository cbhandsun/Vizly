import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StandardDiagramData } from '../../models/DiagramModels';
import {
    addCustomPreset,
    coerceCustomPresetMap,
    CUSTOM_PRESET_NAME_MAX_LENGTH,
    CUSTOM_PRESETS_LIMIT,
    CUSTOM_PRESETS_STORAGE_KEY,
    getCustomPreset,
    normalizeCustomPresetLookupKey,
    readCustomPresetMap,
    saveCustomPreset,
    writeCustomPresetMap,
} from '../customPresetStorage';

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

const makePreset = (id: string): StandardDiagramData => ({
    id,
    name: id,
    type: 'flowchart',
    version: '1.0.0',
    nodes: [{ id: 'n1', description: 'Node', type: 'flowchart', domain: 'default' }],
    edges: [],
    layout: {
        type: 'custom',
        direction: 'TB',
        spacing: { horizontal: 80, vertical: 60 },
        padding: { horizontal: 24, vertical: 16 },
    },
    theme: { name: 'default', displayName: 'Default', domains: {} },
});

describe('customPresetStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        Object.values(safeLogState).forEach((mock) => mock.mockReset());
    });

    it('normalizes custom-prefixed lookup keys', () => {
        expect(CUSTOM_PRESET_NAME_MAX_LENGTH).toBe(120);
        expect(CUSTOM_PRESETS_LIMIT).toBe(100);
        expect(normalizeCustomPresetLookupKey('custom: 工作区 A ')).toBe('工作区 A');
        expect(normalizeCustomPresetLookupKey('')).toBeNull();
        expect(normalizeCustomPresetLookupKey('custom:\u0000bad')).toBe('bad');
    });

    it('coerces preset maps and strips unsafe object keys', () => {
        const map = coerceCustomPresetMap({
            '__proto__': makePreset('polluted'),
            ' My Preset ': {
                ...makePreset('preset-1'),
                metadata: {
                    title: 'Preset title',
                    constructor: { polluted: true },
                },
            },
            bad: null,
        });

        expect(Object.keys(map)).toEqual(['My Preset']);
        expect(map['My Preset'].id).toBe('preset-1');
        expect(Object.hasOwn(map['My Preset'].metadata as Record<string, unknown>, 'constructor')).toBe(false);
    });

    it('reads malformed storage as empty and supports custom-prefixed lookup', () => {
        localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, '{broken');
        expect(readCustomPresetMap()).toEqual({});
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[customPresetStorage] Failed to read "diagram-custom-presets":',
            expect.anything()
        );

        localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify({
            Workspace: makePreset('workspace-id'),
        }));

        expect(getCustomPreset('custom:Workspace')?.id).toBe('workspace-id');
    });

    it('falls back to empty map when storage payload is oversized', () => {
        localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, '{'.repeat(2 * 1024 * 1024 + 1));
        expect(readCustomPresetMap()).toEqual({});
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[customPresetStorage] Failed to read "diagram-custom-presets":',
            expect.anything()
        );
    });

    it('writes and appends normalized presets', () => {
        const added = addCustomPreset(' Workspace ', makePreset('workspace-id'));
        expect(added?.name).toBe('workspace-id');

        const written = writeCustomPresetMap({
            Workspace: makePreset('workspace-id'),
            Bad: null as any,
        });

        expect(Object.keys(written)).toEqual(['Workspace']);
        expect(JSON.parse(localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY) || '{}')).toEqual(written);
    });

    it('bounds the number of stored presets while skipping invalid entries', () => {
        const raw = {
            Bad: null,
            ...Object.fromEntries(Array.from({ length: 130 }, (_, index) => [`Preset ${index}`, makePreset(`preset-${index}`)])),
        };

        const map = coerceCustomPresetMap(raw);
        expect(Object.keys(map)).toHaveLength(100);
        expect(map['Preset 0']).toBeDefined();
        expect(map['Preset 99']).toBeDefined();
        expect(map['Preset 100']).toBeUndefined();
    });

    it('rejects a new preset at capacity without claiming or attempting a write', () => {
        const presets = Object.fromEntries(Array.from(
            { length: CUSTOM_PRESETS_LIMIT },
            (_, index) => [`Preset ${index}`, makePreset(`preset-${index}`)],
        ));
        const storage = {
            getItem: vi.fn(() => JSON.stringify(presets)),
            setItem: vi.fn(),
        };

        expect(saveCustomPreset('Overflow', makePreset('overflow'), storage)).toEqual({
            ok: false,
            error: 'capacity',
        });
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('still permits an explicit overwrite when the library is at capacity', () => {
        const presets = Object.fromEntries(Array.from(
            { length: CUSTOM_PRESETS_LIMIT },
            (_, index) => [`Preset ${index}`, makePreset(`preset-${index}`)],
        ));
        const storage = {
            getItem: vi.fn(() => JSON.stringify(presets)),
            setItem: vi.fn(),
        };

        const result = saveCustomPreset('Preset 0', makePreset('updated'), storage);

        expect(result).toMatchObject({ ok: true, preset: { id: 'updated' } });
        expect(storage.setItem).toHaveBeenCalledTimes(1);
    });

    it('does not replace unreadable storage and reports the read failure', () => {
        const malformedStorage = {
            getItem: vi.fn(() => '{broken'),
            setItem: vi.fn(),
        };
        const throwingStorage = {
            getItem: vi.fn(() => { throw new Error('read denied'); }),
            setItem: vi.fn(),
        };

        expect(saveCustomPreset('Safe', makePreset('safe'), malformedStorage)).toEqual({
            ok: false,
            error: 'readFailed',
        });
        expect(saveCustomPreset('Safe', makePreset('safe'), throwingStorage)).toEqual({
            ok: false,
            error: 'readFailed',
        });
        expect(malformedStorage.setItem).not.toHaveBeenCalled();
        expect(throwingStorage.setItem).not.toHaveBeenCalled();
    });

    it('reports a rejected write instead of returning a false success', () => {
        const storage = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(() => { throw new Error('quota exceeded'); }),
        };

        expect(saveCustomPreset('Safe', makePreset('safe'), storage)).toEqual({
            ok: false,
            error: 'writeFailed',
        });
    });
});
