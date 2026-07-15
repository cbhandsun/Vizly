import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearDisplayCrossingClusterFixedPointsForTests,
  createDisplayCrossingClusterFixedPointCanonicalKey,
  DISPLAY_CROSSING_CLUSTER_FIXED_POINT_CAPACITY,
  hasDisplayCrossingClusterFixedPoint,
  rememberDisplayCrossingClusterFixedPoint,
} from '../baseReactFlowDisplayCrossingClusterFixedPointCache';
import { repairBoundedMultiEdgeResidualStrictCrossings } from '../baseReactFlowDisplayCrossingClusterRepair';

const node = (id: string, x: number, y: number, width = 60, height = 40): Node => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
});

const crossingEdges = (): Edge[] => [
  {
    id: 'horizontal',
    source: 'h-source',
    target: 'h-target',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: {
      computedPath: [{ x: 0, y: 10 }, { x: 20, y: 10 }],
    },
  },
  {
    id: 'vertical',
    source: 'v-source',
    target: 'v-target',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: {
      computedPath: [{ x: 10, y: 0 }, { x: 10, y: 20 }],
    },
  },
];

const endpointNodes = (): Node[] => [
  node('h-source', -60, -10),
  node('h-target', 20, -10),
  node('v-source', -20, -40),
  node('v-target', -20, 20),
];

describe('display crossing cluster fixed-point cache', () => {
  beforeEach(() => clearDisplayCrossingClusterFixedPointsForTests());

  it('hits unchanged references and independently cloned exact inputs', () => {
    const edges = crossingEdges();
    const nodes = endpointNodes();

    expect(hasDisplayCrossingClusterFixedPoint(edges, nodes)).toBe(false);
    expect(rememberDisplayCrossingClusterFixedPoint(edges, nodes)).toBe(true);
    expect(hasDisplayCrossingClusterFixedPoint(edges, nodes)).toBe(true);

    const equivalentEdges = edges.map(edge => ({
      ...edge,
      data: JSON.parse(JSON.stringify(edge.data)),
    }));
    const equivalentNodes = JSON.parse(JSON.stringify(nodes)) as Node[];
    expect(hasDisplayCrossingClusterFixedPoint(equivalentEdges, equivalentNodes)).toBe(true);
  });

  it.each([
    ['id', (edges: Edge[]) => {
      edges[0].id = 'changed-id';
    }],
    ['source', (edges: Edge[]) => {
      edges[0].source = 'changed-source';
    }],
    ['target', (edges: Edge[]) => {
      edges[0].target = 'changed-target';
    }],
    ['computed path', (edges: Edge[]) => {
      ((edges[0].data as Record<string, any>).computedPath as Array<{ x: number; y: number }>)[1].x += 1;
    }],
    ['source handle', (edges: Edge[]) => {
      edges[0].sourceHandle = 'left';
    }],
    ['target handle', (edges: Edge[]) => {
      edges[0].targetHandle = 'right';
    }],
    ['manual handle sides', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).manualHandleSides = ['source'];
    }],
    ['source handle lock', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).sourceHandleLocked = true;
    }],
    ['target handle lock', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).targetHandleLocked = true;
    }],
    ['source port policy', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).sourcePortPolicy = 'fixed';
    }],
    ['target port policy', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).targetPortPolicy = 'forbidden';
    }],
    ['source port constraint', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).sourcePortConstraint = 'strong';
    }],
    ['target port constraint', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).targetPortConstraint = 'fixed-side';
    }],
    ['quality intent', (edges: Edge[]) => {
      (edges[0].data as Record<string, any>).sharedTrunkAware = true;
    }],
  ] as const)('invalidates an in-place %s change', (_label, mutate) => {
    const edges = crossingEdges();
    const nodes = endpointNodes();
    expect(rememberDisplayCrossingClusterFixedPoint(edges, nodes)).toBe(true);

    mutate(edges);

    expect(hasDisplayCrossingClusterFixedPoint(edges, nodes)).toBe(false);
  });

  it('invalidates every cross-reference edge identity category and edge order', () => {
    const mutations: Array<(edges: Edge[]) => void> = [
      edges => { edges[0].id = 'other-id'; },
      edges => { edges[0].source = 'other-source'; },
      edges => { edges[0].target = 'other-target'; },
      edges => { edges[0].sourceHandle = 'left'; },
      edges => { edges[0].targetHandle = 'right'; },
      edges => { ((edges[0].data as any).computedPath as any[])[1].x += 0.25; },
      edges => { (edges[0].data as any).sourcePortPolicy = 'fixed'; },
      edges => { (edges[0].data as any).sharedTrunkSynthesized = true; },
      edges => { edges.reverse(); },
    ];

    for (const mutate of mutations) {
      clearDisplayCrossingClusterFixedPointsForTests();
      expect(rememberDisplayCrossingClusterFixedPoint(crossingEdges(), endpointNodes())).toBe(true);
      const clone = crossingEdges();
      mutate(clone);
      expect(hasDisplayCrossingClusterFixedPoint(clone, endpointNodes())).toBe(false);
    }
  });

  it('invalidates in-place node position and size changes', () => {
    const positionEdges = crossingEdges();
    const positionNodes = endpointNodes();
    expect(rememberDisplayCrossingClusterFixedPoint(positionEdges, positionNodes)).toBe(true);
    positionNodes[0].position.x += 1;
    expect(hasDisplayCrossingClusterFixedPoint(positionEdges, positionNodes)).toBe(false);

    const sizeEdges = crossingEdges();
    const sizeNodes = endpointNodes();
    expect(rememberDisplayCrossingClusterFixedPoint(sizeEdges, sizeNodes)).toBe(true);
    sizeNodes[0].width = (sizeNodes[0].width ?? 0) + 1;
    expect(hasDisplayCrossingClusterFixedPoint(sizeEdges, sizeNodes)).toBe(false);
  });

  it('invalidates cross-reference node identity, type, parent, order, position, and size', () => {
    const mutations: Array<(nodes: Node[]) => void> = [
      nodes => { nodes[0].id = 'other-node'; },
      nodes => { nodes[0].type = 'group'; },
      nodes => { (nodes[0] as Node & { parentId?: string }).parentId = 'parent'; },
      nodes => { nodes.reverse(); },
      nodes => { nodes[0].position.y += 1; },
      nodes => { nodes[0].height = (nodes[0].height ?? 0) + 1; },
    ];

    for (const mutate of mutations) {
      clearDisplayCrossingClusterFixedPointsForTests();
      expect(rememberDisplayCrossingClusterFixedPoint(crossingEdges(), endpointNodes())).toBe(true);
      const clone = endpointNodes();
      mutate(clone);
      expect(hasDisplayCrossingClusterFixedPoint(crossingEdges(), clone)).toBe(false);
    }
  });

  it('uses a full canonical version-bound key rather than a route hash', () => {
    const input = { edges: crossingEdges(), nodes: endpointNodes() };
    const first = createDisplayCrossingClusterFixedPointCanonicalKey({
      ...input,
      routingVersion: 'routing-v1',
    });
    const second = createDisplayCrossingClusterFixedPointCanonicalKey({
      ...input,
      routingVersion: 'routing-v2',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
    expect(first).toContain('crossing-cluster-fixed-point-v2');
    expect(first).not.toMatch(/^route-v2:/);
  });

  it('skips oversized, unsupported, and throwing policy values', () => {
    const oversizedEdges = crossingEdges();
    (oversizedEdges[0].data as Record<string, any>).sourcePortPolicy = 'x'.repeat(501);
    expect(rememberDisplayCrossingClusterFixedPoint(oversizedEdges, endpointNodes())).toBe(false);

    const oversizedManualSides = crossingEdges();
    (oversizedManualSides[0].data as Record<string, any>).manualHandleSides = Array(65).fill('source');
    expect(rememberDisplayCrossingClusterFixedPoint(oversizedManualSides, endpointNodes())).toBe(false);

    const unsupportedEdges = crossingEdges();
    (unsupportedEdges[0].data as Record<string, any>).targetPortConstraint = { value: 'fixed' };
    expect(rememberDisplayCrossingClusterFixedPoint(unsupportedEdges, endpointNodes())).toBe(false);

    const throwingEdges = crossingEdges();
    Object.defineProperty(throwingEdges[0].data, 'sourceHandleLocked', {
      get: () => { throw new Error('unsafe policy getter'); },
    });
    expect(() => rememberDisplayCrossingClusterFixedPoint(throwingEdges, endpointNodes())).not.toThrow();
    expect(rememberDisplayCrossingClusterFixedPoint(throwingEdges, endpointNodes())).toBe(false);

    const oversizedEdgeSet = Array.from(
      { length: 25 },
      (_, index) => ({ ...crossingEdges()[0], id: `edge-${index}` }),
    );
    expect(rememberDisplayCrossingClusterFixedPoint(oversizedEdgeSet, endpointNodes())).toBe(false);

    const oversizedPath = crossingEdges();
    (oversizedPath[0].data as Record<string, unknown>).computedPath = Array.from(
      { length: 2_001 },
      (_, x) => ({ x, y: 0 }),
    );
    expect(rememberDisplayCrossingClusterFixedPoint(oversizedPath, endpointNodes())).toBe(false);

    const invalidGeometry = endpointNodes();
    invalidGeometry[0].position.x = Number.POSITIVE_INFINITY;
    expect(rememberDisplayCrossingClusterFixedPoint(crossingEdges(), invalidGeometry)).toBe(false);
  });

  it('bounds exact cross-reference fixed points with deterministic LRU eviction', () => {
    const remembered: Edge[][] = [];
    for (let index = 0; index <= DISPLAY_CROSSING_CLUSTER_FIXED_POINT_CAPACITY; index += 1) {
      const edges = crossingEdges();
      edges[0].id = `bounded-${index}`;
      remembered.push(edges);
      expect(rememberDisplayCrossingClusterFixedPoint(edges, endpointNodes())).toBe(true);
    }

    const oldestClone = JSON.parse(JSON.stringify(remembered[0])) as Edge[];
    const newestClone = JSON.parse(JSON.stringify(remembered[remembered.length - 1])) as Edge[];
    expect(hasDisplayCrossingClusterFixedPoint(oldestClone, endpointNodes())).toBe(false);
    expect(hasDisplayCrossingClusterFixedPoint(newestClone, endpointNodes())).toBe(true);
  });

  it('is remembered only after a complete fixed-point search', () => {
    const edges = crossingEdges();
    const originalEdges = JSON.parse(JSON.stringify(edges)) as Edge[];

    const repaired = repairBoundedMultiEdgeResidualStrictCrossings(edges, []);

    expect(repaired).toBe(edges);
    expect(edges).toEqual(originalEdges);
    expect(hasDisplayCrossingClusterFixedPoint(edges, [])).toBe(true);

    const cleanEdges: Edge[] = [{
      id: 'clean',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
    }];
    expect(repairBoundedMultiEdgeResidualStrictCrossings(cleanEdges, [])).toBe(cleanEdges);
    expect(hasDisplayCrossingClusterFixedPoint(cleanEdges, [])).toBe(false);
  });
});
