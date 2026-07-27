import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    resolveFixedMiniMapMessage,
    shouldFreezeFixedMiniMapDuringNodeDrag,
} from '../fixedMiniMapState';

describe('resolveFixedMiniMapMessage', () => {
    it('distinguishes loading, empty, invalid, and renderable states', () => {
        expect(resolveFixedMiniMapMessage({ ready: false, nodeCount: 0, hasBounds: false })).toBe('loading');
        expect(resolveFixedMiniMapMessage({ ready: true, nodeCount: 0, hasBounds: false })).toBe('empty');
        expect(resolveFixedMiniMapMessage({ ready: true, nodeCount: 2, hasBounds: false })).toBe('loading');
        expect(resolveFixedMiniMapMessage({ ready: true, nodeCount: 2, hasBounds: true })).toBeNull();
    });

    it('freezes the expensive node preview only between active drag frames', () => {
        expect(shouldFreezeFixedMiniMapDuringNodeDrag({
            wasDragging: true,
            isDragging: true,
        })).toBe(true);
        expect(shouldFreezeFixedMiniMapDuringNodeDrag({
            wasDragging: false,
            isDragging: true,
        })).toBe(false);
        expect(shouldFreezeFixedMiniMapDuringNodeDrag({
            wasDragging: true,
            isDragging: false,
        })).toBe(false);
    });

    it('keeps the drag freeze style scoped to the minimap portal', () => {
        const stylesheet = readFileSync(
            resolve(process.cwd(), 'src/core/components/shared/FixedMiniMap.css'),
            'utf8',
        );

        expect(stylesheet).toMatch(
            /\.fixed-minimap-container\.drag-frozen\s*\{[^}]*opacity:\s*0\.35;[^}]*pointer-events:\s*none;/s,
        );
    });
});
