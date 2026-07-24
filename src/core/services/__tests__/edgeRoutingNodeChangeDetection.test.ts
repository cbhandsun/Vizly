import { describe, expect, it } from 'vitest';

import {
    coerceEdgeRoutingSnapshotNodes,
    detectChangedEdgeRoutingNodes,
    EDGE_ROUTING_NODE_MOVE_THRESHOLD,
} from '../edgeRoutingNodeChangeDetection';

describe('edgeRoutingNodeChangeDetection', () => {
    it('coerces runtime node records and drops invalid identities and coordinates', () => {
        expect(coerceEdgeRoutingSnapshotNodes([
            null,
            { id: '' },
            { id: 42, position: { x: 1, y: 2 } },
            { id: 'valid', position: { x: 10, y: Number.POSITIVE_INFINITY } },
            { id: 'absolute', computed: { positionAbsolute: { x: 30, y: 40 } } },
        ])).toEqual([
            { id: 'valid', position: { x: 10, y: undefined } },
            { id: 'absolute', computed: { positionAbsolute: { x: 30, y: 40 } } },
        ]);
    });

    it('marks new nodes as changed and stores their positions', () => {
        const snapshot = new Map<string, { x: number; y: number }>();

        const changed = detectChangedEdgeRoutingNodes(
            [{ id: 'node-1', position: { x: 10, y: 20 } }],
            snapshot
        );

        expect(changed).toEqual(['node-1']);
        expect(snapshot.get('node-1')).toEqual({ x: 10, y: 20 });
    });

    it('ignores moves within threshold and uses absolute-position fallback order', () => {
        const snapshot = new Map<string, { x: number; y: number }>([['node-1', { x: 10, y: 20 }]]);

        const unchanged = detectChangedEdgeRoutingNodes(
            [{
                id: 'node-1',
                position: { x: 999, y: 999 },
                computed: { positionAbsolute: { x: 99, y: 99 } },
                positionAbsolute: { x: 11, y: 21 },
            }],
            snapshot
        );

        expect(unchanged).toEqual([]);
        expect(snapshot.get('node-1')).toEqual({ x: 10, y: 20 });
    });

    it('marks moves beyond threshold and prefers positionAbsolute over other sources', () => {
        const snapshot = new Map<string, { x: number; y: number }>([['node-1', { x: 10, y: 20 }]]);

        const changed = detectChangedEdgeRoutingNodes(
            [{
                id: 'node-1',
                position: { x: 0, y: 0 },
                computed: { positionAbsolute: { x: 50, y: 60 } },
                positionAbsolute: { x: 10 + EDGE_ROUTING_NODE_MOVE_THRESHOLD + 1, y: 20 },
            }],
            snapshot
        );

        expect(changed).toEqual(['node-1']);
        expect(snapshot.get('node-1')).toEqual({ x: 13, y: 20 });
    });

    it('drops stale snapshot entries when the cache is much larger than live nodes', () => {
        const snapshot = new Map<string, { x: number; y: number }>();
        snapshot.set('live', { x: 1, y: 1 });
        for (let index = 0; index < 60; index += 1) {
            snapshot.set(`stale-${index}`, { x: index, y: index });
        }

        detectChangedEdgeRoutingNodes([{ id: 'live', position: { x: 1, y: 1 } }], snapshot);

        expect(snapshot.has('live')).toBe(true);
        expect([...snapshot.keys()]).toEqual(['live']);
    });
});
