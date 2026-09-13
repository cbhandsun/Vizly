import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';

vi.mock('../../../layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidth: () => 160,
      calculateNodeHeight: () => 80,
    }),
  },
}));

import { shouldFitInitialDesignerCanvas } from '../useDesignerInitialDiagramLoad';

describe('initial designer canvas readiness', () => {
  it('keeps a genuinely empty canvas on the lightweight startup path', () => {
    expect(shouldFitInitialDesignerCanvas([])).toBe(false);
  });

  it('requests measured fit and routing activation when nodes exist', () => {
    const nodes: Node[] = [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
    expect(shouldFitInitialDesignerCanvas(nodes)).toBe(true);
  });
});
