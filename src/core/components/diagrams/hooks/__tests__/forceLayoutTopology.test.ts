import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { resolveForceLayoutEngine } from '../forceLayoutTopology';

const nodes: Node[] = ['a', 'b', 'c'].map(id => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
}));

describe('force layout topology dispatch', () => {
  it('keeps a directed forest on the native force engine', () => {
    const edges: Edge[] = [
      { id: 'a-b', source: 'a', target: 'b' },
      { id: 'a-c', source: 'a', target: 'c' },
    ];

    expect(resolveForceLayoutEngine(nodes, edges)).toBe('force');
  });

  it('uses layered ranking when multiple parents would violate the hard crossing contract', () => {
    const edges: Edge[] = [
      { id: 'a-c', source: 'a', target: 'c' },
      { id: 'b-c', source: 'b', target: 'c' },
    ];

    expect(resolveForceLayoutEngine(nodes, edges)).toBe('elk-layered');
  });
});
