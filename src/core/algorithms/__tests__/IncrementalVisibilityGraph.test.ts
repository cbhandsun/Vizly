import { describe, expect, it } from 'vitest';

import { IncrementalVisibilityGraph } from '../IncrementalVisibilityGraph';

describe('IncrementalVisibilityGraph', () => {
    it('tracks soft-deleted vertices without placing nulls in the point array', () => {
        const graph = new IncrementalVisibilityGraph([], undefined, { enableAutoCleanup: false });
        graph.addObstacle('box', { x: 0, y: 0, width: 100, height: 80 });
        graph.removeObstacle('box');

        expect(graph.getStats().deletedVertices).toBeGreaterThan(0);
        expect(graph.getGraph().vertices.every((point) => (
            typeof point.x === 'number' && typeof point.y === 'number'
        ))).toBe(true);
    });
});
