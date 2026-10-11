import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { areCollaborationElementsEqual, COLLABORATION_MAX_NODES, parseCollaborationSnapshot } from '../collaborationSnapshot';

const node: Node = { id: 'n', position: { x: 0, y: 0 }, data: { label: 'Node' } };
const entries = (value: unknown): Array<[string, unknown]> => [['n', value]];
describe('collaboration snapshot boundary', () => {
    it('rejects throwing input without propagating it into the canvas observer', () => {
        const invalid = { ...node, get data(): Record<string, unknown> { throw new Error('untrusted getter'); } };
        expect(parseCollaborationSnapshot(entries(invalid), [])).toBeNull();
        const iterator: Iterable<[string, unknown]> = {
            [Symbol.iterator]() { return { next(): IteratorResult<[string, unknown]> { throw new Error('untrusted iterator'); } }; },
        };
        expect(parseCollaborationSnapshot(iterator, [])).toBeNull();
    });
    it('accepts valid and empty snapshots, including connected edges', () => {
        expect(parseCollaborationSnapshot([], [])).toEqual({ nodes: [], edges: [] });
        expect(parseCollaborationSnapshot(entries(node), [['e', { id: 'e', source: 'n', target: 'n', label: 'Edge' }]])).toMatchObject({ nodes: [node], edges: [{ id: 'e', label: 'Edge' }] });
    });
    it.each([null, {}, { ...node, id: 'other' }, { ...node, position: { x: NaN, y: 0 } }, { ...node, position: { x: Infinity, y: 0 } }, { ...node, position: { x: 1000001, y: 0 } }])('rejects malformed or unsafe node batches', value => {
        expect(parseCollaborationSnapshot(entries(value), [])).toBeNull();
    });
    it('rejects dangling edges, mismatched keys and oversized graph counts', () => {
        expect(parseCollaborationSnapshot(entries(node), [['e', { id: 'other', source: 'n', target: 'n' }]])).toBeNull();
        expect(parseCollaborationSnapshot(entries(node), [['e', { id: 'e', source: 'n', target: 'missing' }]])).toBeNull();
        const many: Array<[string, unknown]> = Array.from({ length: COLLABORATION_MAX_NODES + 1 }, (_, i) => [`n${i}`, { ...node, id: `n${i}` }]);
        expect(parseCollaborationSnapshot(many, [])).toBeNull();
    });
    it('rejects prototype keys, cyclic data and cumulative payload budgets', () => {
        const poisoned = JSON.parse('{"__proto__":{"polluted":true}}');
        expect(parseCollaborationSnapshot(entries({ ...node, data: poisoned }), [])).toBeNull();
        const cycle: Record<string, unknown> = {}; cycle.self = cycle;
        expect(parseCollaborationSnapshot(entries({ ...node, data: cycle }), [])).toBeNull();
        const large = { label: '图'.repeat(19000) };
        const many: Array<[string, unknown]> = Array.from({ length: 40 }, (_, i) => [`n${i}`, { ...node, id: `n${i}`, data: large }]);
        expect(parseCollaborationSnapshot(many, [])).toBeNull();
        expect(Object.prototype).not.toHaveProperty('polluted');
    });
});

describe('collaboration visible changes', () => {
    it('compares nested data independently of property insertion order', () => {
        expect(areCollaborationElementsEqual(node, { data: { label: 'Node' }, position: { y: 0, x: 0 }, id: 'n' })).toBe(true);
    });
    it.each([{ style: { background: '#fff' } }, { parentId: 'group' }, { hidden: true }, { width: 100 }])('synchronizes node style and grouping changes', changes => {
        expect(areCollaborationElementsEqual(node, { ...node, ...changes })).toBe(false);
    });
    it.each([{ label: 'Updated' }, { markerEnd: 'arrow' }, { animated: true }, { style: { stroke: '#f00' } }])('synchronizes labels, markers, animation and edge style', changes => {
        const edge: Edge = { id: 'e', source: 'n', target: 'n' };
        expect(areCollaborationElementsEqual(edge, { ...edge, ...changes })).toBe(false);
    });
});
