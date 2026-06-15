import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    coerceActiveLayerId,
    coerceLayers,
    DEFAULT_LAYER,
    FLOWCHART_ACTIVE_LAYER_STORAGE_KEY,
    FLOWCHART_LAYERS_STORAGE_KEY,
    readActiveLayerId,
    readLayers,
    writeActiveLayerId,
    writeLayers,
} from '../layerStorage';

describe('layerStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('coerces layer arrays to safe, deduped, sequential configs', () => {
        const layers = coerceLayers([
            { id: 'layer-1', name: ' Ops ', visible: false, locked: true, color: '#abcdef', zIndex: 99 },
            { id: 'layer-1', name: 'Duplicate', visible: true, locked: false, zIndex: 0 },
            { id: '<script>', name: 'Bad', visible: true, locked: false, zIndex: 0 },
            { id: 'layer-2', name: '', visible: 'yes', locked: 'no', color: 'red', zIndex: 4 },
        ]);

        expect(layers).toEqual([
            DEFAULT_LAYER,
            { id: 'layer-1', name: 'Ops', visible: false, locked: true, color: '#abcdef', zIndex: 1 },
            { id: 'layer-2', name: 'layer-2', visible: true, locked: false, zIndex: 2 },
        ]);
    });

    it('preserves valid default-layer visibility and lock state when loaded', () => {
        expect(coerceLayers([
            { id: 'layer-0', name: 'Base', visible: false, locked: true, zIndex: 3 },
        ])).toEqual([
            { id: 'layer-0', name: 'Base', visible: false, locked: true, zIndex: 0 },
        ]);
    });

    it('falls back to default layer for malformed storage', () => {
        expect(readLayers()).toEqual([DEFAULT_LAYER]);

        localStorage.setItem(FLOWCHART_LAYERS_STORAGE_KEY, '{bad');
        expect(readLayers()).toEqual([DEFAULT_LAYER]);

        localStorage.setItem(FLOWCHART_LAYERS_STORAGE_KEY, JSON.stringify([{ id: '<bad>', name: 'bad' }]));
        expect(readLayers()).toEqual([DEFAULT_LAYER]);
    });

    it('coerces active layer ids against available layers', () => {
        const layers = coerceLayers([{ id: 'layer-1', name: 'One', visible: true, locked: false, zIndex: 0 }]);

        expect(coerceActiveLayerId('layer-1', layers)).toBe('layer-1');
        expect(coerceActiveLayerId('missing', layers)).toBe(DEFAULT_LAYER.id);
        expect(coerceActiveLayerId('<script>', layers)).toBe(DEFAULT_LAYER.id);
    });

    it('reads and writes normalized layers and active layer ids', () => {
        const layers = writeLayers([
            { id: 'layer-1', name: 'One', visible: true, locked: false, zIndex: 100 },
        ]);
        expect(JSON.parse(localStorage.getItem(FLOWCHART_LAYERS_STORAGE_KEY) || '[]')).toEqual(layers);

        expect(writeActiveLayerId('layer-1', layers)).toBe('layer-1');
        expect(localStorage.getItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY)).toBe('layer-1');
        expect(readActiveLayerId(layers)).toBe('layer-1');

        localStorage.setItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY, 'missing');
        expect(readActiveLayerId(layers)).toBe(DEFAULT_LAYER.id);
    });
});
