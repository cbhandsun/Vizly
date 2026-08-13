import { describe, expect, it } from 'vitest';

import { resolveMindMapContextMenuPosition } from '../mindMapContextMenuLayout';

describe('resolveMindMapContextMenuPosition', () => {
    it('keeps a menu at the requested point when there is enough room', () => {
        expect(resolveMindMapContextMenuPosition({
            x: 200,
            y: 100,
            viewportWidth: 1280,
            viewportHeight: 900,
        })).toEqual({ left: 200, top: 100 });
    });

    it('keeps the full estimated menu inside the lower and right edges', () => {
        expect(resolveMindMapContextMenuPosition({
            x: 1200,
            y: 650,
            viewportWidth: 1280,
            viewportHeight: 720,
        })).toEqual({ left: 1042, top: 152 });
    });

    it('bounds small, negative, and invalid viewports without negative positions', () => {
        expect(resolveMindMapContextMenuPosition({
            x: -20,
            y: Number.NaN,
            viewportWidth: 180,
            viewportHeight: 120,
        })).toEqual({ left: 8, top: 8 });
    });
});
