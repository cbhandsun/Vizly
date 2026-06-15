import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addCustomPreset,
    coerceCustomPresetMap,
    CUSTOM_PRESETS_STORAGE_KEY,
    getCustomPreset,
    normalizeCustomPresetLookupKey,
    readCustomPresetMap,
    writeCustomPresetMap,
} from '../customPresetStorage';

const makePreset = (id: string) => ({
    id,
    name: id,
    type: 'flowchart',
    version: '1.0.0',
    nodes: [{ id: 'n1', description: 'Node', type: 'flowchart', domain: 'default' }],
    edges: [],
});

describe('customPresetStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('normalizes custom-prefixed lookup keys', () => {
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

        localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify({
            Workspace: makePreset('workspace-id'),
        }));

        expect(getCustomPreset('custom:Workspace')?.id).toBe('workspace-id');
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
});
