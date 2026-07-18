import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';

import { refineLayout } from '../LayoutRefinement';

describe('refineLayout', () => {
  it('refines a left-to-right layout without losing its orientation context', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 200, y: 40 }, data: {} },
      { id: 'c', position: { x: 400, y: 80 }, data: {} },
    ];

    const result = refineLayout(nodes, [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
    ], { direction: 'LR' });

    expect(result.nodes).toHaveLength(3);
    expect(result.stats.layerCount).toBeGreaterThan(0);
  });
});
