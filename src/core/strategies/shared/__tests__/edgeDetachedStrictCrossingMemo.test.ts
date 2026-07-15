import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildDetachedStrictCrossingRepairSignature,
  DetachedStrictCrossingRepairMemo,
  type DetachedStrictCrossingPathPatch,
} from '../edgeDetachedStrictCrossingMemo';
import { repairDetachedStrictCrossingBypasses } from '../edgeDetachedStrictCrossingRepair';

type Point = { x: number; y: number };

const crossingEdges = (businessMarker: string): Edge[] => [
  {
    id: 'memo-horizontal',
    source: 'horizontal-source',
    target: 'horizontal-target',
    label: `${businessMarker}-horizontal-label`,
    style: { stroke: businessMarker },
    data: {
      businessMarker,
      computedPath: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
    },
  },
  {
    id: 'memo-vertical',
    source: 'vertical-source',
    target: 'vertical-target',
    label: `${businessMarker}-vertical-label`,
    style: { stroke: businessMarker },
    data: {
      businessMarker,
      computedPath: [{ x: 50, y: 0 }, { x: 50, y: 100 }],
    },
  },
];

const inputPaths = (): Point[][] => [
  [{ x: 0, y: 50 }, { x: 100, y: 50 }],
  [{ x: 50, y: 0 }, { x: 50, y: 100 }],
];

const obstacleNode = (): Node => ({
  id: 'obstacle',
  type: 'shape',
  position: { x: 12, y: 24 },
  positionAbsolute: { x: 12, y: 24 },
  measured: { width: 80, height: 48 },
  data: {},
} as Node);

describe('DetachedStrictCrossingRepairMemo', () => {
  it('returns bounded normal and no-change hits as defensive path-patch copies', () => {
    const memo = new DetachedStrictCrossingRepairMemo(2);
    const patches: DetachedStrictCrossingPathPatch[] = [{
      edgeIndex: 1,
      path: [{ x: 10, y: 20 }, { x: 30, y: 20 }],
    }];
    const expectedPatches: DetachedStrictCrossingPathPatch[] = [{
      edgeIndex: 1,
      path: [{ x: 10, y: 20 }, { x: 30, y: 20 }],
    }];

    memo.set('patched', patches);
    memo.set('no-change', []);
    patches[0].path[0].x = 777;

    const firstHit = memo.get('patched');
    expect(firstHit).toEqual(expectedPatches);
    firstHit![0].path[0].x = 999;
    expect(memo.get('patched')).toEqual(expectedPatches);
    expect(memo.get('no-change')).toEqual([]);

    memo.set('newest', []);
    expect(memo.get('patched')).toBeNull();
    expect(memo.get('no-change')).toEqual([]);
  });

  it('invalidates when a compact path is mutated in place', () => {
    const edges = crossingEdges('baseline');
    const paths = inputPaths();
    const before = buildDetachedStrictCrossingRepairSignature(edges, [], paths);

    paths[0][1].x = 101;

    expect(buildDetachedStrictCrossingRepairSignature(edges, [], paths)).not.toBe(before);
  });

  it('invalidates for handle and quality-intent changes but ignores unrelated business data', () => {
    const edges = crossingEdges('baseline');
    const paths = inputPaths();
    const before = buildDetachedStrictCrossingRepairSignature(edges, [], paths);

    (edges[0].data as Record<string, unknown>).businessMarker = 'current-business-value';
    expect(buildDetachedStrictCrossingRepairSignature(edges, [], paths)).toBe(before);

    edges[0].sourceHandle = 'right';
    const withHandle = buildDetachedStrictCrossingRepairSignature(edges, [], paths);
    expect(withHandle).not.toBe(before);

    (edges[0].data as Record<string, unknown>).sharedTrunkAware = true;
    expect(buildDetachedStrictCrossingRepairSignature(edges, [], paths)).not.toBe(withHandle);
  });

  it('invalidates from the normalized routing-obstacle geometry after an in-place node change', () => {
    const edges = crossingEdges('baseline');
    const paths = inputPaths();
    const nodes = [obstacleNode()];
    const before = buildDetachedStrictCrossingRepairSignature(edges, nodes, paths);

    ((nodes[0] as any).positionAbsolute as { x: number; y: number }).x += 1;

    expect(buildDetachedStrictCrossingRepairSignature(edges, nodes, paths)).not.toBe(before);
  });

  it('applies a cached route patch to the latest edges without replacing business attributes', () => {
    const firstInput = crossingEdges('first');
    const firstOutput = repairDetachedStrictCrossingBypasses(firstInput, []);
    const changedIndexes = firstOutput.flatMap((edge, index) => (
      JSON.stringify((edge.data as Record<string, unknown>).computedPath)
        === JSON.stringify((firstInput[index].data as Record<string, unknown>).computedPath)
        ? []
        : [index]
    ));
    expect(changedIndexes.length).toBeGreaterThan(0);

    const latestInput = crossingEdges('latest');
    const latestOutput = repairDetachedStrictCrossingBypasses(latestInput, []);

    expect(latestOutput).not.toBe(latestInput);
    for (const [index, edge] of latestOutput.entries()) {
      expect((edge.data as Record<string, unknown>).businessMarker).toBe('latest');
      expect(edge.label).toBe(`latest-${index === 0 ? 'horizontal' : 'vertical'}-label`);
      expect(edge.style).toEqual({ stroke: 'latest' });
    }
    for (const index of changedIndexes) {
      const firstPath = (firstOutput[index].data as Record<string, unknown>).computedPath;
      const latestPath = (latestOutput[index].data as Record<string, unknown>).computedPath;
      expect(latestPath).toEqual(firstPath);
      expect(latestPath).not.toBe(firstPath);
    }
  });
});
