import { describe, expect, it } from 'vitest';

import {
    collectHardNodeObstacleRects,
    collectSoftNodeObstacleRects,
} from '../edgeRoutingNodeObstacles';

describe('edgeRoutingNodeObstacles', () => {
    it('collects title and container border obstacles for titled container nodes', () => {
        const rects = collectSoftNodeObstacleRects([
            {
                type: 'group',
                position: { x: 100, y: 200 },
                measured: { width: 120, height: 80 },
            },
        ]);

        expect(rects).toEqual([
            { x: 108, y: 206, width: 104, height: 24 },
            { x: 96, y: 200, width: 8, height: 80 },
            { x: 216, y: 200, width: 8, height: 80 },
            { x: 100, y: 196, width: 120, height: 8 },
            { x: 100, y: 276, width: 120, height: 8 },
        ]);
    });

    it('collects title obstacles for non-container nodes with visible titles only', () => {
        const rects = collectSoftNodeObstacleRects([
            {
                type: 'task',
                data: { label: 'Node A' },
                computed: { positionAbsolute: { x: 10, y: 20 } },
                width: 90,
                height: 60,
            },
            {
                type: 'task',
                computed: { positionAbsolute: { x: 0, y: 0 } },
                width: 90,
                height: 60,
            },
        ]);

        expect(rects).toEqual([{ x: 18, y: 26, width: 74, height: 24 }]);
    });

    it('collects hard obstacles for non-container nodes and keeps geometry fallback order', () => {
        const rects = collectHardNodeObstacleRects([
            {
                type: 'group',
                position: { x: 1, y: 2 },
                measured: { width: 3, height: 4 },
            },
            {
                type: 'task',
                position: { x: 10, y: 20 },
                positionAbsolute: { x: 30, y: 40 },
                computed: { positionAbsolute: { x: 50, y: 60 } },
                measured: { width: 70, height: 80 },
            },
        ]);

        expect(rects).toEqual([{ x: 50, y: 60, width: 70, height: 80 }]);
    });
});
