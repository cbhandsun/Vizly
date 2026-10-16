import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { createLocalCollaborationSnapshotCache } from '../localCollaborationSnapshotCache';
import { parseCollaborationSnapshot } from '../collaborationSnapshot';

const node = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: { label: id } });
const full = (nodes: Node[], edges: Edge[]) => parseCollaborationSnapshot(
    nodes.map(value => [value.id, value]), edges.map(value => [value.id, value]),
);
describe('local collaboration owned snapshot cache', () => {
    it('reuses unchanged sanitized elements and only replaces the edited node', () => {
        const cache = createLocalCollaborationSnapshotCache();
        const nodes = [node('a'), node('b')];
        const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b' }];
        const first = cache.parse(nodes, edges);
        const second = cache.parse([{ ...nodes[0], position: { x: 30, y: 10 } }, nodes[1]], edges);
        expect(second).toEqual(full([{ ...nodes[0], position: { x: 30, y: 10 } }, nodes[1]], edges));
        expect(second?.nodes[1]).toBe(first?.nodes[1]);
        expect(second?.edges[0]).toBe(first?.edges[0]);
        expect(second?.nodes[0]).not.toBe(first?.nodes[0]);
        cache.clear();
        expect(cache.parse(nodes, edges)?.nodes[1]).not.toBe(first?.nodes[1]);
    });
    it('detects in-place edits and rejects unsafe mutation without altering the prior snapshot', () => {
        const cache = createLocalCollaborationSnapshotCache();
        const value = node('a');
        const first = cache.parse([value], []);
        value.data.label = 'Updated';
        expect(cache.parse([value], [])?.nodes[0].data.label).toBe('Updated');
        expect(first?.nodes[0].data.label).toBe('a');
        value.position.x = Infinity;
        expect(cache.parse([value], [])).toBeNull();
    });
    it('validates cached edge endpoints after node removal and supports an empty document', () => {
        const cache = createLocalCollaborationSnapshotCache();
        const nodes = [node('a'), node('b')];
        const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b' }];
        expect(cache.parse(nodes, edges)).toEqual(full(nodes, edges));
        expect(cache.parse([nodes[0]], edges)).toBeNull();
        expect(cache.parse([], [])).toEqual({ nodes: [], edges: [] });
    });
    it('retains cumulative size, count, duplicate and prototype rejection', () => {
        const cache = createLocalCollaborationSnapshotCache();
        const nodes = Array.from({ length: 40 }, (_, index) => ({ ...node(`n${index}`), data: { label: '图'.repeat(19000) } }));
        expect(cache.parse(nodes, [])).toBeNull();
        expect(cache.parse(Array.from({ length: 1001 }, (_, index) => node(`n${index}`)), [])).toBeNull();
        expect(cache.parse([node('a'), node('a')], [])).toBeNull();
        expect(cache.parse([node('a')], [{ id: 'e1', source: 'a', target: 'a' }, { id: 'e2', source: 'a', target: 'a' }])).toBeNull();
        expect(cache.parse([{ ...node('a'), data: JSON.parse('{"__proto__":{"polluted":true}}') }], [])).toBeNull();
    });
});
