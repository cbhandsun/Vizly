// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import * as measuredDisplayRepair from '../baseReactFlowDisplayMeasuredRepair';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'target', position: { x: 300, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
];

const edges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }] },
}];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('baseReactFlowDisplayEdges worker repair mode', () => {
  it('dispatches bounded repair through the measured repair pipeline', () => {
    const repairSpy = vi.spyOn(
      measuredDisplayRepair,
      'repairBaseReactFlowMeasuredDisplayEdgesWithReport',
    );
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'repair',
      requestId: 'repair-only',
      edges,
      nodes,
      repairMode: 'bounded',
    });

    expect(repairSpy).toHaveBeenCalledTimes(1);
    expect(response.requestId).toBe('repair-only');
    expect(Array.isArray(response.edges)).toBe(true);
    expect(typeof response.hardClean).toBe('boolean');
    expect(response.routeResolution).toBe('repair');
  });
});
