import { describe, expect, it } from 'vitest';

import {
    coerceFreehandStroke,
    createFreehandNode,
    DEFAULT_FREEHAND_COLOR,
    getFreehandSvgPath,
    MAX_FREEHAND_COORDINATE_ABS,
    MAX_FREEHAND_POINTS,
} from '../freehandStrokeModel';

describe('freehandStrokeModel', () => {
    it('coerces finite points, removes near duplicates, and normalizes presentation values', () => {
        const stroke = coerceFreehandStroke({
            points: [[1, 2, -1], [1.1, 2.1, 0.5], [8, 9, 2]],
            color: '#ABCDEF',
            size: 100,
        });

        expect(stroke).toEqual({
            points: [[1, 2, 0], [8, 9, 1]],
            color: '#abcdef',
            size: 64,
        });
    });

    it.each([
        null,
        {},
        { points: [] },
        { points: [[Number.NaN, 0, 0.5]] },
        { points: [[MAX_FREEHAND_COORDINATE_ABS + 1, 0, 0.5]] },
        { points: [['<script>', 0, 0.5]] },
    ])('rejects empty, invalid, extreme, or unsafe point input %#', value => {
        expect(coerceFreehandStroke(value)).toBeNull();
    });

    it('bounds point volume and replaces unsafe colors', () => {
        const points = Array.from({ length: MAX_FREEHAND_POINTS + 50 }, (_, index) => [index, index, 0.5]);
        const stroke = coerceFreehandStroke({ points, color: 'url(javascript:alert(1))' });

        expect(stroke?.points).toHaveLength(MAX_FREEHAND_POINTS);
        expect(stroke?.color).toBe(DEFAULT_FREEHAND_COLOR);
    });

    it('creates a bounded, movable React Flow node using relative point data', () => {
        const node = createFreehandNode({
            points: [[100, 200, 0.5], [130, 240, 0.5]],
            color: '#112233',
            size: 4,
        }, 'layer-2', () => 'stroke-id');

        expect(node).not.toBeNull();
        expect(node).toMatchObject({
            id: 'freehand-stroke-id',
            type: 'freehand',
            data: { color: '#112233', size: 4, layer: 'layer-2' },
        });
        expect(node?.position.x).toBeLessThan(100);
        expect(node?.position.y).toBeLessThan(200);
        expect(node?.data.points[0][0]).toBeGreaterThan(0);
        expect(node?.data.points[0][1]).toBeGreaterThan(0);
        expect(getFreehandSvgPath(node!.data)).not.toMatch(/NaN|Infinity/);
    });
});
