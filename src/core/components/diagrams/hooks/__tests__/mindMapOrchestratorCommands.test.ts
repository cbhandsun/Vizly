import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { exportMindMapToMarkdown } from '../mindMapMarkdown';
import { createMindMapLayoutSignature } from '../useMindMapAutoLayout';
import {
  collectMindMapSubtree,
  createMindMapPastePayload,
  createMindMapQuickAdd,
} from '../mindMapOrchestratorCommands';

const node = (
  id: string,
  depth: number,
  label = id,
  y = 0,
): Node => ({
  id,
  type: 'mindmap',
  position: { x: 0, y },
  data: { depth, label },
});

const edge = (source: string, target: string, type = 'mindmapEdge'): Edge => ({
  id: `${source}-${target}-${type}`,
  source,
  target,
  type,
});

describe('mind map orchestrator commands', () => {
  it('tracks structural layout inputs but ignores relationship-only changes', () => {
    const root = node('root', 0);
    root.data = { ...root.data, direction: 'LR', pathStyle: 'bezier', shape: 'pill' };
    const child = node('child', 1);
    const structuralEdge = edge('root', 'child');
    const baseline = createMindMapLayoutSignature([root, child], [structuralEdge]);

    expect(createMindMapLayoutSignature([], [])).toBe('####C#');
    expect(createMindMapLayoutSignature([root, child], [
      structuralEdge,
      edge('root', 'child', 'relationshipEdge'),
    ])).toBe(baseline);
    expect(createMindMapLayoutSignature([
      root,
      { ...child, data: { ...child.data, collapsed: true } },
    ], [structuralEdge])).not.toBe(baseline);
    expect(createMindMapLayoutSignature([
      { ...root, data: { ...root.data, direction: 'TB' } },
      child,
    ], [structuralEdge])).not.toBe(baseline);
    expect(createMindMapLayoutSignature([
      root,
      { ...child, data: { ...child.data, branchColor: '#ff0000' } },
    ], [structuralEdge])).not.toBe(baseline);
  });

  it('exports ordered plain Markdown and terminates on cyclic input', () => {
    const nodes = [
      node('root', 0, '<b>Root</b>\nTitle'),
      node('lower', 1, 'Lower', 100),
      node('upper', 1, 'Upper', 10),
    ];
    const edges = [
      edge('root', 'lower'),
      edge('root', 'upper'),
      edge('upper', 'root'),
      edge('lower', 'upper', 'relationshipEdge'),
    ];

    expect(exportMindMapToMarkdown(nodes, edges)).toBe('# Root Title\n- Upper\n- Lower');
    expect(exportMindMapToMarkdown([], [])).toBe('');
  });

  it('creates a bounded quick-add command from non-finite inputs', () => {
    const result = createMindMapQuickAdd({
      parentId: 'root',
      direction: 'LR',
      depth: Number.NaN,
      siblingCount: Number.POSITIVE_INFINITY,
      idSeed: Number.NaN,
    });

    expect(result.node.id).toBe('mindmap-node-0');
    expect(result.node.data.depth).toBe(1);
    expect(result.edge.source).toBe('root');
    expect(result.edge.style).toMatchObject({ strokeWidth: 4 });
  });

  it('collects only structural subtree nodes and handles cycles', () => {
    const nodes = [node('root', 0), node('child', 1), node('outside', 0)];
    const clipboard = collectMindMapSubtree(nodes, [
      edge('root', 'child'),
      edge('child', 'root'),
      edge('root', 'outside', 'relationshipEdge'),
    ], 'root');

    expect(clipboard?.nodes.map((item) => item.id).sort()).toEqual(['child', 'root']);
    expect(clipboard?.edges).toHaveLength(2);
    expect(collectMindMapSubtree(nodes, [], 'missing')).toBeNull();
  });

  it('remaps pasted IDs and coerces invalid positions without mutating the clipboard', () => {
    const root = node('root', 0);
    root.position = { x: Number.NaN, y: Number.POSITIVE_INFINITY };
    const child = node('child', 1);
    const clipboard = collectMindMapSubtree([root, child], [edge('root', 'child')], 'root')!;
    const payload = createMindMapPastePayload(clipboard, 'target', Number.NaN)!;

    expect(payload.nodes.map((item) => item.id)).toEqual([
      'mindmap-paste-0-0',
      'mindmap-paste-0-1',
    ]);
    expect(payload.nodes[0].position).toEqual({ x: 40, y: 40 });
    expect(payload.edges[0]).toMatchObject({
      source: 'target',
      target: 'mindmap-paste-0-0',
    });
    expect(clipboard.nodes[0].id).toBe('root');
  });

  it('rejects invalid paste roots and empty targets', () => {
    const invalid = { nodes: [], edges: [], rootId: 'missing' };
    expect(createMindMapPastePayload(invalid, 'target', 1)).toBeNull();
    expect(createMindMapPastePayload({ nodes: [node('root', 0)], edges: [], rootId: 'root' }, '', 1))
      .toBeNull();
  });
});
