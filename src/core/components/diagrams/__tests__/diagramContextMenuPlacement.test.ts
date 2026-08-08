import { describe, expect, it } from 'vitest';

import { resolveDiagramContextMenuPosition } from '../diagramContextMenuPlacement';

const bounds = { left: 100, top: 50, width: 800, height: 600 };

describe('diagram context menu placement', () => {
    it('keeps an ordinary node menu at the pointer and opens its submenu to the right', () => {
        expect(resolveDiagramContextMenuPosition({
            clientX: 300,
            clientY: 200,
            bounds,
            type: 'node',
        })).toEqual({ left: 200, top: 150, submenuPlacement: 'right' });
    });

    it('reserves the full multi-selection height near the bottom edge', () => {
        expect(resolveDiagramContextMenuPosition({
            clientX: 500,
            clientY: 640,
            bounds,
            type: 'multi-node',
        })).toEqual({ left: 400, top: 172, submenuPlacement: 'left' });
    });

    it('opens submenus toward the side with enough room', () => {
        expect(resolveDiagramContextMenuPosition({
            clientX: 130,
            clientY: 200,
            bounds,
            type: 'pane',
        }).submenuPlacement).toBe('right');

        expect(resolveDiagramContextMenuPosition({
            clientX: 850,
            clientY: 200,
            bounds,
            type: 'pane',
        }).submenuPlacement).toBe('left');
    });

    it('returns finite in-bounds coordinates for invalid and tiny bounds', () => {
        const result = resolveDiagramContextMenuPosition({
            clientX: Number.NaN,
            clientY: Number.POSITIVE_INFINITY,
            bounds: { left: 10, top: 20, width: -1, height: Number.NaN },
            type: 'selection',
        });

        expect(result).toEqual({ left: 8, top: 8, submenuPlacement: 'left' });
    });
});
