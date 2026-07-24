import { describe, expect, it } from 'vitest';

import type { ObstacleNode } from '../../obstacleContext';
import { collectRoutingNodeRects, snapSimpleOrthogonalPath } from '../smartEdgeRoutingGeometry';

describe('smartEdgeRoutingGeometry', () => {
    it('resolves nested absolute positions and filters invalid dimensions', () => {
        const nodes = new Map<string, ObstacleNode>();
        nodes.set('parent', {
            id: 'parent',
            position: { x: 100, y: 50 },
            width: 300,
            height: 200,
            data: {},
        });
        nodes.set('child', {
            id: 'child',
            parentId: 'parent',
            position: { x: 10, y: 20 },
            measured: { width: 80, height: 40 },
            data: {},
        });
        nodes.set('invalid', {
            id: 'invalid',
            position: { x: 0, y: 0 },
            width: Number.POSITIVE_INFINITY,
            height: 20,
            data: {},
        });

        expect(collectRoutingNodeRects(nodes)).toEqual([
            expect.objectContaining({ id: 'parent', x: 100, y: 50, width: 300, height: 200 }),
            expect.objectContaining({ id: 'child', x: 110, y: 70, width: 80, height: 40 }),
        ]);
    });

    it('snaps only micro-axis drift in simple orthogonal paths', () => {
        expect(snapSimpleOrthogonalPath('M 0 0 L 0.5 20 L 30 20.4')).toBe('M 0 0 L 0 20 L 30 20');
        expect(snapSimpleOrthogonalPath('M 0 0 C 1 2 3 4 5 6')).toContain('C');
    });
});
