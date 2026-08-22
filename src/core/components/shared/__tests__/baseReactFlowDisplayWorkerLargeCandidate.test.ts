// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import * as fullRoutePipeline from '../baseReactFlowDisplayFullRoutePipeline';

describe('display routing Worker large candidate boundary', () => {
  it('validates hard-clean candidates above the persistent-cache edge limit', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    for (let index = 0; index < 301; index += 1) {
      const y = index * 30;
      nodes.push(
        { id: `source-${index}`, position: { x: 0, y }, measured: { width: 10, height: 10 }, data: {} },
        { id: `target-${index}`, position: { x: 200, y }, measured: { width: 10, height: 10 }, data: {} },
      );
      edges.push({
        id: `edge-${index}`,
        source: `source-${index}`,
        target: `target-${index}`,
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { computedPath: [{ x: 10, y: y + 5 }, { x: 200, y: y + 5 }] },
      });
    }
    const fullRouteSpy = vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges');
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'validate-301-edges',
      edges,
      candidateEdges: edges,
      candidateSource: 'persistent',
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 3,
      qualityMode: 'full',
    });

    expect(response.hardClean).toBe(true);
    expect(response.edges).toHaveLength(301);
    expect(response.routeResolution).toBe('repaired-candidate');
    expect(response.edges?.every(edge => edge.type === 'stablePath')).toBe(true);
    expect(fullRouteSpy).not.toHaveBeenCalled();
  }, 30_000);
});
