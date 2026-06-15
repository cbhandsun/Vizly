import { beforeEach, describe, expect, it } from 'vitest';
import {
    DIAGRAM_FAVORITES_STORAGE_KEY,
    DIAGRAM_RECENT_STORAGE_KEY,
    DIAGRAM_SELECTED_STORAGE_KEY,
    addRecentDiagramId,
    coerceDiagramIdList,
    isSafeDiagramId,
    readFavoriteDiagramIds,
    readRecentDiagramIds,
    readSelectedDiagramId,
    toggleFavoriteDiagramId,
    writeFavoriteDiagramIds,
    writeRecentDiagramIds,
    writeSelectedDiagramId,
} from '../diagramHostStorage';

describe('diagramHostStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('validates diagram ids', () => {
        expect(isSafeDiagramId('wms-demand-allocation-strategy-v2')).toBe(true);
        expect(isSafeDiagramId('folder/diagram:v1')).toBe(true);
        expect(isSafeDiagramId('')).toBe(false);
        expect(isSafeDiagramId('x'.repeat(181))).toBe(false);
        expect(isSafeDiagramId('bad id')).toBe(false);
        expect(isSafeDiagramId('<script>')).toBe(false);
    });

    it('coerces id lists by filtering, deduping, and limiting entries', () => {
        const ids = coerceDiagramIdList([
            'a',
            'bad id',
            'a',
            'b',
            ...Array.from({ length: 20 }, (_, index) => `d-${index}`),
        ], 5);

        expect(ids).toEqual(['a', 'b', 'd-0', 'd-1', 'd-2']);
    });

    it('reads and writes selected diagram id safely', () => {
        localStorage.setItem(DIAGRAM_SELECTED_STORAGE_KEY, 'bad id');
        expect(readSelectedDiagramId('fallback')).toBe('fallback');

        expect(writeSelectedDiagramId(' diagram-a ')).toBe('diagram-a');
        expect(localStorage.getItem(DIAGRAM_SELECTED_STORAGE_KEY)).toBe('diagram-a');
        expect(writeSelectedDiagramId('bad id')).toBeNull();
        expect(localStorage.getItem(DIAGRAM_SELECTED_STORAGE_KEY)).toBe('diagram-a');
    });

    it('handles recent diagram ids safely', () => {
        localStorage.setItem(DIAGRAM_RECENT_STORAGE_KEY, '{broken');
        expect(readRecentDiagramIds()).toEqual([]);

        writeRecentDiagramIds(['a', 'bad id', 'a', ...Array.from({ length: 20 }, (_, index) => `r-${index}`)]);
        expect(readRecentDiagramIds()).toHaveLength(12);
        expect(readRecentDiagramIds().slice(0, 3)).toEqual(['a', 'r-0', 'r-1']);

        expect(addRecentDiagramId('r-1')).toEqual(['r-1', 'a', 'r-0', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6', 'r-7', 'r-8', 'r-9', 'r-10']);
        expect(addRecentDiagramId('bad id')).toEqual(readRecentDiagramIds());
    });

    it('handles favorite diagram ids safely', () => {
        localStorage.setItem(DIAGRAM_FAVORITES_STORAGE_KEY, JSON.stringify(['fav-a', 'bad id', 'fav-a']));
        expect(readFavoriteDiagramIds()).toEqual(['fav-a']);

        expect(toggleFavoriteDiagramId('fav-b')).toEqual(['fav-b', 'fav-a']);
        expect(toggleFavoriteDiagramId('fav-a')).toEqual(['fav-b']);
        expect(toggleFavoriteDiagramId('bad id')).toEqual(['fav-b']);

        const many = writeFavoriteDiagramIds(Array.from({ length: 90 }, (_, index) => `fav-${index}`));
        expect(many).toHaveLength(80);
        expect(readFavoriteDiagramIds()).toHaveLength(80);
    });
});
