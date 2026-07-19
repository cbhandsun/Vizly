import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: () => ({ edge: { busEnabled: true } }),
  },
}));

import {
  beautifyOrthogonalEdges,
  bundleEdges,
  layerBasedEdgeRouting,
  optimizeEdgeLabelPositions,
  optimizeTreeBusRouting,
} from '../AdvancedRouting';

const nodes = [
  { id: 'hub', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
  { id: 'a', position: { x: 200, y: 0 }, measured: { width: 100, height: 50 } },
  { id: 'b', position: { x: 220, y: 10 }, measured: { width: 100, height: 50 } },
  { id: 'far', position: { x: 1000, y: 0 }, measured: { width: 100, height: 50 } },
  { id: 'down', position: { x: 0, y: 300 }, measured: { width: 100, height: 50 } },
];

describe('AdvancedRouting', () => {
  it('bundles nearby edges by source and target regions', () => {
    const result = bundleEdges([
      { id: 'e1', source: 'hub', target: 'a', data: { keep: true } },
      { id: 'e2', source: 'hub', target: 'b' },
      { id: 'e3', source: 'a', target: 'far' },
    ], nodes, { regionSize: 500, minBundleSize: 2, bundleSpacing: 10 });

    expect(result[0].data).toMatchObject({ keep: true, bundleId: 'bundle_0', bundleSize: 2, bundleIndex: 0, bundleOffset: -5 });
    expect(result[1].data).toMatchObject({ bundleId: 'bundle_0', bundleSize: 2, bundleIndex: 1, bundleOffset: 5 });
    expect(result[2].data?.bundleId).toBeUndefined();
    expect(bundleEdges(result, nodes, { enabled: false })).toBe(result);
  });

  it('adds layer control points to long edges', () => {
    const result = layerBasedEdgeRouting([
      { id: 'long', source: 'hub', target: 'far', data: { keep: true } },
      { id: 'short', source: 'hub', target: 'a' },
    ], nodes, { layerThreshold: 300, maxControlPoints: 2, layoutDirection: 'LR' });

    expect(result[0].data).toMatchObject({
      keep: true,
      isLongEdge: true,
      layerControlPoints: [{ x: 383, y: 25 }, { x: 717, y: 25 }],
    });
    expect(result[1].data?.isLongEdge).toBeUndefined();
  });

  it('places labels and adjusts overlapping labels away from nodes or prior labels', () => {
    const result = optimizeEdgeLabelPositions([
      { id: 'e1', source: 'hub', target: 'a', label: 'first' },
      { id: 'e2', source: 'hub', target: 'a', data: { label: 'second' } },
      { id: 'e3', source: 'hub', target: 'b' },
    ], nodes, { labelWidth: 60, labelHeight: 20, labelPadding: 8 });

    expect(result[0].data?.labelPosition).toMatchObject({ x: 150, y: 25 });
    expect(result[1].data?.labelPosition.adjusted).toBe(true);
    expect(result[2].data?.labelPosition).toBeUndefined();
  });

  it('beautifies nearly straight orthogonal edges with facing handles', () => {
    const horizontal = beautifyOrthogonalEdges([
      { id: 'e1', source: 'hub', target: 'a' },
    ], nodes, { minSegmentLength: 40, straightenThreshold: 10 });
    const vertical = beautifyOrthogonalEdges([
      { id: 'e2', source: 'hub', target: 'down' },
    ], nodes, { minSegmentLength: 40, straightenThreshold: 10 });

    expect(horizontal[0]).toMatchObject({ sourceHandle: 'r', targetHandle: 'l', data: { beautified: true } });
    expect(vertical[0]).toMatchObject({ sourceHandle: 'b', targetHandle: 't', data: { beautified: true } });
    expect(beautifyOrthogonalEdges(horizontal, nodes, { enabled: false })).toBe(horizontal);
  });

  it('creates tree bus paths for one-to-many and many-to-one groups', () => {
    const oneToMany = optimizeTreeBusRouting([
      { id: 'e1', source: 'hub', target: 'a' },
      { id: 'e2', source: 'hub', target: 'b' },
    ], nodes, { minBusSize: 2, trunkLength: 40, layoutDirection: 'LR' });

    expect(oneToMany[0].sourceHandle).toBe('r');
    expect(oneToMany[0].targetHandle).toBe('l');
    expect(oneToMany[0].data).toMatchObject({ isTreeBus: true, treeRouting: { type: 'tree-out' } });
    expect(oneToMany[0].data.computedPath).toHaveLength(4);

    const manyToOne = optimizeTreeBusRouting([
      { id: 'e3', source: 'a', target: 'hub' },
      { id: 'e4', source: 'b', target: 'hub' },
    ], nodes, { minBusSize: 2, trunkLength: 40, layoutDirection: 'RL' });

    expect(manyToOne[0].sourceHandle).toBe('l');
    expect(manyToOne[0].targetHandle).toBe('r');
    expect(manyToOne[0].data).toMatchObject({ isTreeBus: true, treeRouting: { type: 'tree-in' } });
    expect(optimizeTreeBusRouting(manyToOne, nodes, { enabled: false })).toBe(manyToOne);
  });
});
