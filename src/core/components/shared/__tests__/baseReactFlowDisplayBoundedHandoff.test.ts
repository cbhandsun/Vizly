import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createBaseReactFlowFullRouteEdges,
  selectBaseReactFlowFullRouteSeedEdges,
} from '../baseReactFlowDisplayFullRoutePipeline';
import { computeBaseReactFlowDisplayEdgeEpoch } from '../baseReactFlowDisplayEdgeCore';
import { baseNodes } from './baseReactFlowDisplayEdges.testUtils';

describe('bounded pre-display handoff', () => {
  it('keeps the prepared seed reference without mutating either phase input', () => {
    const rawEdges = [{ id: 'raw', source: 'a', target: 'b' }] as Edge[];
    const preparedEdges = [{
      ...rawEdges[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: 0, y: 100 }] },
    }] as Edge[];
    const rawSnapshot = structuredClone(rawEdges);
    const preparedSnapshot = structuredClone(preparedEdges);

    expect(selectBaseReactFlowFullRouteSeedEdges(rawEdges, preparedEdges)).toBe(preparedEdges);
    expect(selectBaseReactFlowFullRouteSeedEdges(rawEdges, null)).toBe(rawEdges);
    expect(rawEdges).toEqual(rawSnapshot);
    expect(preparedEdges).toEqual(preparedSnapshot);
  });

  it('requests a prepared seed instead of allowing a recursive full-route fallback', () => {
    const edges: Edge[] = Array.from({ length: 25 }, (_, index) => ({
      id: `edge-${index}`,
      source: `source-${index}`,
      target: `target-${index}`,
    }));
    let skipFullRouteFallback: boolean | undefined;
    let calls = 0;

    const result = createBaseReactFlowFullRouteEdges({
      edges,
      nodes: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      createPreDisplayFinalEdges: (args) => {
        calls += 1;
        skipFullRouteFallback = args.skipFullRouteFallback;
        args.onBoundedCandidate?.({ hardClean: true } as any);
        return [];
      },
    });

    expect(calls).toBe(1);
    expect(skipFullRouteFallback).toBe(true);
    expect(result).toEqual([]);
  });

  it('returns an already-finalized phase input by reference', () => {
    const edges: Edge[] = [
      { id: 'edge', source: 'source', target: 'target', type: 'advanced-smart-step' },
    ];
    const first = createBaseReactFlowFullRouteEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges }),
    });
    const second = createBaseReactFlowFullRouteEdges({
      edges: first,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges: first }),
    });

    expect(second).toBe(first);
  });
});
