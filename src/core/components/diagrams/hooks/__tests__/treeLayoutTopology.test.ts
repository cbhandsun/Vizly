import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { isDirectedForestLayoutGraph } from '../treeLayoutTopology';

const nodes = ['a', 'b', 'c', 'd'].map(id => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
})) as Node[];

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

describe('isDirectedForestLayoutGraph', () => {
  it('accepts empty graphs, trees, and disconnected forests', () => {
    expect(isDirectedForestLayoutGraph([], [])).toBe(true);
    expect(isDirectedForestLayoutGraph(nodes, [
      edge('a-b', 'a', 'b'),
      edge('a-c', 'a', 'c'),
    ])).toBe(true);
  });

  it('rejects a child with multiple parents', () => {
    expect(isDirectedForestLayoutGraph(nodes, [
      edge('a-c', 'a', 'c'),
      edge('b-c', 'b', 'c'),
    ])).toBe(false);
  });

  it('rejects feedback cycles and self loops', () => {
    expect(isDirectedForestLayoutGraph(nodes, [
      edge('a-b', 'a', 'b'),
      edge('b-a', 'b', 'a'),
    ])).toBe(false);
    expect(isDirectedForestLayoutGraph(nodes, [edge('a-a', 'a', 'a')])).toBe(false);
  });

  it('ignores orphan edges outside the supplied layout boundary', () => {
    expect(isDirectedForestLayoutGraph(nodes, [edge('outside', 'missing', 'a')])).toBe(true);
  });
});
