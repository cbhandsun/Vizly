import { describe, expect, it } from 'vitest';
import { buildAIChangePlan, buildAIEditPrompt, createAIEditContext, fingerprintAIGraph, retainExplicitAIEditNodes, type AICanvasGraph } from '../aiCanvasEdit';

const graph = (): AICanvasGraph => ({ nodes: [
    { id: 'outside', position: { x: 0, y: 0 }, data: { label: 'Keep me', shape: 'diamond' } },
    { id: 'edit', selected: true, position: { x: 250, y: 100 }, data: { label: 'Old label', custom: 'keep' } },
    { id: 'other', position: { x: 500, y: 100 }, data: { label: 'Other' } },
], edges: [{ id: 'boundary', source: 'outside', target: 'edit', label: 'Keep edge' },
    { id: 'other-edge', source: 'outside', target: 'other' }] });

describe('AI edit scope and change plans', () => {
    it('ignores converter-created parents while retaining explicit out-of-scope checks', () => {
        const before = graph();
        before.nodes.push({ id: 'domain-parent', type: 'group', position: { x: 0, y: 0 }, data: { label: 'Orders' } });
        before.nodes[1].parentId = 'domain-parent';
        const context = createAIEditContext(before, 'document', 'selection')!;
        const converted = { nodes: [before.nodes[3], { ...before.nodes[1], data: { label: 'Updated' } }], edges: [] };
        const explicit = retainExplicitAIEditNodes(converted, ['edit']);
        const plan = buildAIChangePlan(before, explicit, 'edit', context);
        expect(plan.changes).toEqual([{kind:'node', action:'update', id:'edit', before:'Old label', after:'Updated'}]);
        expect(plan.next.nodes.find(n => n.id === 'edit')?.parentId).toBe('domain-parent');
        expect(plan.next.edges).toEqual(before.edges);
        expect(() => buildAIChangePlan(before, retainExplicitAIEditNodes(converted, ['edit', 'domain-parent']), 'edit', context)).toThrow('outOfScope');
    });
    it('includes selected nodes beyond the old 30-node cutoff and only internal edges', () => {
        const before = graph();
        before.nodes.unshift(...Array.from({ length: 40 }, (_, i) => ({ id: `prefix-${i}`, position: { x: i, y: 0 }, data: { label: 'Unselected' } })));
        const context = createAIEditContext(before, 'document', 'selection')!;
        const prompt = buildAIEditPrompt(before, context);
        expect(context.nodeIds).toEqual(['edit']);
        expect(prompt).toContain('Old label');
        expect(prompt).not.toContain('Unselected');
        expect(prompt).not.toContain('Keep edge');
    });

    it('updates only scoped nodes, preserves positions and boundary edges, and reports the diff', () => {
        const before = graph();
        const context = createAIEditContext(before, 'document', 'selection')!;
        const result = buildAIChangePlan(before, { nodes: [{ id: 'edit', position: { x: 0, y: 0 }, data: { label: 'New label' } }], edges: [] }, 'edit', context);
        expect(result.next.nodes.find(n => n.id === 'outside')).toBe(before.nodes[0]);
        expect(result.next.nodes.find(n => n.id === 'edit')).toEqual({ ...before.nodes[1], data: { label: 'New label', custom: 'keep' } });
        expect(result.next.edges).toEqual(before.edges);
        expect(result.changes).toEqual([{ kind: 'node', action: 'update', id: 'edit', before: 'Old label', after: 'New label' }]);
    });

    it('makes explicit scoped removals and incident edge removals visible before application', () => {
        const before = graph();
        const context = createAIEditContext(before, 'document', 'selection')!;
        const result = buildAIChangePlan(before, { nodes: [], edges: [] }, 'edit', context);
        expect(result.changes.map(c => [c.kind, c.action, c.id])).toEqual([
            ['node', 'remove', 'edit'], ['edge', 'remove', 'boundary'],
        ]);
        expect(result.next.edges).toEqual([before.edges[1]]);
    });

    it('rejects modifications outside the selected scope', () => {
        const before = graph();
        const context = createAIEditContext(before, 'document', 'selection')!;
        expect(() => buildAIChangePlan(before, { nodes: [before.nodes[0]], edges: [] }, 'edit', context)).toThrow('outOfScope');
    });

    it('rejects proposals after canvas changes or repeated application', () => {
        const before = graph();
        const context = createAIEditContext(before, 'document', 'selection')!;
        const generated = { nodes: [{ ...before.nodes[1], data: { label: 'New' } }], edges: [] };
        const result = buildAIChangePlan(before, generated, 'edit', context);
        expect(() => buildAIChangePlan(result.next, generated, 'edit', context)).toThrow('stale');
    });

    it('does not invalidate a proposal because selection or measurement changed', () => {
        const before = graph();
        const remeasured = { ...before, nodes: before.nodes.map(node => ({ ...node, selected: false, measured: { width: 300, height: 50 } })) };
        expect(fingerprintAIGraph(remeasured)).toBe(fingerprintAIGraph(before));
    });

    it('remaps appended IDs and edges without mutating the original graph', () => {
        const before = graph();
        const original = JSON.stringify(before);
        const result = buildAIChangePlan(before, before, 'append');
        expect(new Set(result.next.nodes.map(n => n.id)).size).toBe(6);
        expect(result.next.edges).toHaveLength(4);
        expect(result.next.edges[2].source).toBe(result.next.nodes[3].id);
        expect(JSON.stringify(before)).toBe(original);
    });

    it('requires a nonempty selection and rejects orphaned edges', () => {
        expect(() => createAIEditContext({ nodes: [], edges: [] }, 'document', 'selection')).toThrow('emptySelection');
        expect(() => buildAIChangePlan(graph(), { nodes: [], edges: [{ id: 'bad', source: 'a', target: 'b' }] }, 'replace')).toThrow('invalid');
    });
});
