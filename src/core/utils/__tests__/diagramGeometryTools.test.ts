import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { diffDiagrams, diffSummary } from '../diagramDiff';
import { resolveGlobalNodeOverlapsSimple } from '../overlapUtils';

const node = (id: string, x: number, data: Record<string, unknown> = {}): Node => ({
  id,
  position: { x, y: 0 },
  measured: { width: 40, height: 40 },
  data,
});

describe('diagram geometry tools', () => {
  it('diffs typed nodes and edges while ignoring runtime-only fields', () => {
    const beforeNodes = [node('same', 0, { label: 'Before' }), node('removed', 100)];
    const afterNodes = [
      { ...node('same', 20, { label: 'After' }), measured: { width: 999, height: 999 } },
      node('added', 200),
    ];
    const beforeEdges: Edge[] = [{ id: 'edge', source: 'same', target: 'removed' }];
    const afterEdges: Edge[] = [{ id: 'edge', source: 'same', target: 'added' }];

    const result = diffDiagrams(
      { nodes: beforeNodes, edges: beforeEdges },
      { nodes: afterNodes, edges: afterEdges },
    );

    expect(result.addedNodes).toEqual(['added']);
    expect(result.removedNodes).toEqual([expect.objectContaining({ id: 'removed' })]);
    expect(result.modifiedNodes[0].changes.map(change => change.key)).toEqual(['position', 'data']);
    expect(result.modifiedEdges[0].changes).toEqual([
      { key: 'target', oldValue: 'removed', newValue: 'added' },
    ]);
    expect(diffSummary(result)).toContain('+1 节点');
  });

  it('uses validated node descriptions for diff labels when the canvas has no legacy label', () => {
    const beforeNodes = [node('carrier', 0, {
      description: '<b>承运商门户/EDI</b><br/>• 招投标/运力发布',
    })];
    const afterNodes = [{
      ...beforeNodes[0],
      data: {
        description: '<b>承运商门户/EDI</b><br/>• 招投标/运力发布',
        locked: true,
      },
    }];

    const result = diffDiagrams(
      { nodes: beforeNodes, edges: [] },
      { nodes: afterNodes, edges: [] },
    );

    expect(result.modifiedNodes).toEqual([
      expect.objectContaining({ id: 'carrier', label: '承运商门户/EDI' }),
    ]);
  });

  it('contains empty, invalid, oversized, and markup-heavy diff labels', () => {
    const beforeNodes = [
      node('unsafe', 0, { description: '<b><img src=x onerror=alert(1)>Unsafe &amp; Label</b>' }),
      node('oversized', 0, { description: 'x'.repeat(300) }),
      node('invalid', 0, { label: 42, description: null }),
      node('empty', 0, { label: '   ', description: '' }),
    ];
    const afterNodes = beforeNodes.map(item => ({
      ...item,
      position: { x: item.position.x + 1, y: item.position.y },
    }));

    const result = diffDiagrams(
      { nodes: beforeNodes, edges: [] },
      { nodes: afterNodes, edges: [] },
    );

    expect(result.modifiedNodes).toEqual([
      expect.objectContaining({ id: 'unsafe', label: 'Unsafe & Label' }),
      expect.objectContaining({ id: 'oversized', label: 'x'.repeat(120) }),
      expect.objectContaining({ id: 'invalid', label: undefined }),
      expect.objectContaining({ id: 'empty', label: undefined }),
    ]);
  });

  it('moves overlapping business nodes without mutating the input array nodes', () => {
    const first = node('first', 0);
    const second = node('second', 10);
    const result = resolveGlobalNodeOverlapsSimple([first, second], 20, 20, 1);

    expect(result[0]).not.toBe(first);
    expect(result[0].position).not.toEqual(first.position);
    expect(result[1].position).not.toEqual(second.position);
    expect(first.position).toEqual({ x: 0, y: 0 });
  });

  it('contains invalid geometry and iteration values', () => {
    const result = resolveGlobalNodeOverlapsSimple([
      { ...node('a', 0), position: { x: Number.NaN, y: Infinity } },
      node('b', 0),
    ], Number.NaN, Infinity, Number.NaN);

    expect(result.every(item => Number.isFinite(item.position.x) && Number.isFinite(item.position.y))).toBe(true);
  });
});
