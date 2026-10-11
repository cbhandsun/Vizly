import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { preserveLocalCollaborationInteraction } from '../collaborationLocalInteraction';

const node: Node = { id: 'a', position: { x: 10, y: 20 }, data: { label: 'Remote label' } };
describe('local interaction during remote collaboration commits', () => {
  it('keeps local text editing and selection while accepting remote content and geometry', () => {
    const snapshot = { nodes: [node], edges: [] };
    const local = { nodes: [{ ...node, selected: true, position: { x: 1, y: 2 }, data: { label: 'Old', isEditing: true, secret: 'local-only' } }] };
    expect(preserveLocalCollaborationInteraction(snapshot, local).nodes[0]).toEqual({ ...node, selected: true, data: { label: 'Remote label', isEditing: true } });
    expect(snapshot.nodes[0]).toEqual(node);
  });
  it('does not resurrect deleted nodes or copy interaction to unrelated identities', () => {
    const local = { nodes: [{ ...node, selected: true, data: { isEditing: true } }] };
    expect(preserveLocalCollaborationInteraction({ nodes: [], edges: [] }, local).nodes).toEqual([]);
    expect(preserveLocalCollaborationInteraction({ nodes: [{ ...node, id: 'b' }], edges: [] }, local).nodes).toEqual([{ ...node, id: 'b' }]);
  });
  it.each([undefined, null, {}, { nodes: null }, { nodes: [null, '', {}] }, { nodes: [{ id: 'a', selected: 'true', data: { isEditing: {} } }] }])('ignores invalid local state', input => {
    expect(preserveLocalCollaborationInteraction({ nodes: [node], edges: [] }, input).nodes).toEqual([node]);
  });
  it('preserves explicit false interaction without copying arbitrary fields', () => {
    expect(preserveLocalCollaborationInteraction({ nodes: [node], edges: [] }, { nodes: [{ id: 'a', selected: false, data: { isEditing: false }, position: { x: Infinity, y: 0 } }] }).nodes)
      .toEqual([{ ...node, selected: false, data: { label: 'Remote label', isEditing: false } }]);
  });
});
