import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { collapseAllMindMapBranches, expandAllMindMapNodes, toggleMindMapNodeCollapse } from '../mindMapCollapseState';

const nodes: Node[] = [
  { id: 'root', type: 'mindmap', position: { x: 0, y: 0 }, data: { depth: 0, direction: 'LR' } },
  { id: 'branch', type: 'mindmap', position: { x: 100, y: 0 }, data: { depth: 1 } },
  { id: 'leaf', type: 'mindmap', position: { x: 200, y: 0 }, data: { depth: 2 } },
];
const edges: Edge[] = [
  { id: 'a', source: 'root', target: 'branch' },
  { id: 'b', source: 'branch', target: 'leaf' },
];

describe('mind map collapse state', () => {
  it('propagates collapsed branch visibility to descendants', () => {
    const collapsed = toggleMindMapNodeCollapse(nodes, edges, 'branch');
    expect(collapsed.find(node => node.id === 'branch')?.data.collapsed).toBe(true);
    expect(collapsed.find(node => node.id === 'leaf')?.hidden).toBe(true);
    expect(toggleMindMapNodeCollapse(collapsed, edges, 'branch').find(node => node.id === 'leaf')?.hidden).toBe(false);
  });

  it('collapses only non-root branches with children', () => {
    const collapsed = collapseAllMindMapBranches(nodes, edges);
    expect(collapsed.find(node => node.id === 'root')?.data.collapsed).toBeUndefined();
    expect(collapsed.find(node => node.id === 'branch')?.data.collapsed).toBe(true);
    expect(collapsed.find(node => node.id === 'leaf')?.data.collapsed).toBeUndefined();
  });

  it('expands collapsed nodes and clears their hidden state', () => {
    const expanded = expandAllMindMapNodes([{ ...nodes[1], hidden: true, data: { depth: 1, collapsed: true } }]);
    expect(expanded[0]).toMatchObject({ hidden: false, data: { collapsed: false } });
  });
});
