import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calculate: vi.fn(),
  loadFlat: vi.fn(async () => ({ calculateLayout: vi.fn() })),
  loadCompound: vi.fn(async () => ({ calculateLayout: vi.fn() })),
}));

vi.mock('../reverseLayeredLayoutGeometry', () => ({
  calculateLayeredLayoutWithReverse: mocks.calculate,
}));

vi.mock('../layoutStrategyRuntime', () => ({
  LAYERED_TREE_ROUTING_SPACING: Object.freeze({ nodeSpacing: 120, levelSpacing: 120 }),
  loadDomainElkStrategy: mocks.loadFlat,
  loadDomainCompoundElkStrategy: mocks.loadCompound,
}));

import { commitCyclicTreeLayeredLayout } from '../cyclicTreeLayeredLayout';

const nodes = [
  { id: 'source', position: { x: 0, y: 0 }, data: {} },
  { id: 'target', position: { x: 200, y: 0 }, data: {} },
] as Node[];
const edges = [{ id: 'edge', source: 'source', target: 'target' }] as Edge[];
const input = {
  layoutNodes: nodes,
  layoutEdges: edges,
  allNodes: nodes,
  nonLayoutTypes: new Set<string>(),
  direction: 'LR' as const,
};

describe('commitCyclicTreeLayeredLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calculate.mockResolvedValue({ nodes, edges });
  });

  it('retries a hard-rejected flat candidate once with compound ELK', async () => {
    const commit = vi.fn()
      .mockRejectedValueOnce(new Error('layout-routing-hard-quality-rejected'))
      .mockResolvedValueOnce(undefined);

    await commitCyclicTreeLayeredLayout(input, commit);

    expect(mocks.loadFlat).toHaveBeenCalledOnce();
    expect(mocks.loadCompound).toHaveBeenCalledOnce();
    expect(mocks.calculate).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenNthCalledWith(1, expect.objectContaining({ nodes }), false);
    expect(commit).toHaveBeenNthCalledWith(2, expect.objectContaining({ nodes }), true);
  });

  it('does not retry failures outside the hard-quality boundary', async () => {
    const commit = vi.fn().mockRejectedValue(new Error('layout-routing-cancelled'));

    await expect(commitCyclicTreeLayeredLayout(input, commit))
      .rejects.toThrow('layout-routing-cancelled');

    expect(mocks.loadFlat).toHaveBeenCalledOnce();
    expect(mocks.loadCompound).not.toHaveBeenCalled();
    expect(mocks.calculate).toHaveBeenCalledOnce();
  });
});
