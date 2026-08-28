// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  markBaseDisplayFinalized,
  withDisplayAbsolutePositions,
} from '../baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import * as displayFinalizer from '../baseReactFlowDisplayFinalizer';
import { createBaseReactFlowDisplayExactReport } from '../baseReactFlowDisplayFinalizer';
import * as fullRoutePipeline from '../baseReactFlowDisplayFullRoutePipeline';
import * as measuredDisplayRepair from '../baseReactFlowDisplayMeasuredRepair';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const routeNodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
];

const cleanEdges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'stablePath',
  data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }] },
}];

const dirtyEdges: Edge[] = [{
  ...cleanEdges[0],
  data: {
    computedPath: [{ x: 100, y: 30 }, { x: 200, y: 80 }, { x: 300, y: 30 }],
  },
}];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('baseReactFlowDisplay finalization boundaries', () => {
  it('locks only finite internally finalized computed paths to the stable renderer', () => {
    const finalized = markBaseDisplayFinalized<Edge[]>([{
      id: 'final-route',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
      data: { computedPath: [{ x: 50, y: 200 }, { x: 350, y: 0 }] },
    }], 'final-route-signature');
    const malformed = markBaseDisplayFinalized<Edge[]>([{
      id: 'malformed-route',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
      data: { computedPath: [{ x: Number.NaN, y: 200 }, { x: 350, y: 0 }] },
    }], 'malformed-route-signature');

    expect(finalized[0].type).toBe('stablePath');
    expect(finalized[0].data?.layoutPathLocked).toBe(true);
    expect(finalized[0].data?._layoutPathLocked).toBe(true);
    expect(malformed[0].type).toBe('advanced-smart-step');
    expect(malformed[0].data?.layoutPathLocked).toBeUndefined();
  });

  it('preserves measured absolute positions for nested nodes', () => {
    type NodeWithAbsolutePosition = Node & {
      positionAbsolute?: { x: number; y: number };
    };
    const parent: NodeWithAbsolutePosition = {
      id: 'parent',
      position: { x: 100, y: 200 },
      data: {},
      positionAbsolute: { x: 1_200.5, y: 1_300.25 },
    };
    const child: NodeWithAbsolutePosition = {
      id: 'child',
      parentId: 'parent',
      position: { x: 10, y: 20 },
      data: {},
      positionAbsolute: { x: 1_500.75, y: 1_600.5 },
    };
    const nodes = [parent, child];

    const result = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(node => [node.id, node] as const)),
    );

    expect(result.map(node => (node as NodeWithAbsolutePosition).positionAbsolute)).toEqual([
      { x: 1_200.5, y: 1_300.25 },
      { x: 1_500.75, y: 1_600.5 },
    ]);
  });

  it('certifies a measured repair only when its strict routing evidence is unchanged', () => {
    const repairNodes = withDisplayAbsolutePositions(
      routeNodes,
      new Map(routeNodes.map(node => [node.id, node] as const)),
    );
    const actualDirtyReport = getDisplayHardQualityGateReport(dirtyEdges, repairNodes, 'polished');
    const detachedDirtyReport = {
      ...actualDirtyReport,
      hardClean: false,
      terminalsAttached: false,
      terminalsAnchored: false,
    };
    const exactReport = createBaseReactFlowDisplayExactReport(
      dirtyEdges,
      routeNodes,
      repairNodes,
      detachedDirtyReport,
    );
    const changedDirtyEdges: Edge[] = [{
      ...dirtyEdges[0],
      data: {
        ...dirtyEdges[0].data,
        computedPath: [{ x: 100, y: 30 }, { x: 201, y: 80 }, { x: 300, y: 30 }],
      },
    }];
    vi.spyOn(
      measuredDisplayRepair,
      'repairBaseReactFlowMeasuredDisplayEdgesWithReport',
    ).mockReturnValueOnce({
      edges: dirtyEdges,
      report: detachedDirtyReport,
    }).mockReturnValueOnce({
      edges: changedDirtyEdges,
      report: detachedDirtyReport,
    });

    const fixedPoint = displayFinalizer.finalizeBaseReactFlowDisplayEdgesWithReport(
      dirtyEdges,
      routeNodes,
      exactReport,
    );

    expect(fixedPoint.edges).toBe(dirtyEdges);
    expect(fixedPoint.measuredRepairReachedFixedPoint).toBe(true);
    const progressing = displayFinalizer.finalizeBaseReactFlowDisplayEdgesWithReport(
      dirtyEdges,
      routeNodes,
      exactReport,
    );
    expect(progressing.edges).toBe(changedDirtyEdges);
    expect(progressing.measuredRepairReachedFixedPoint).toBe(false);
  });

  it('skips only a certified duplicate Worker repair and preserves its result', () => {
    const dirtyReport = getDisplayHardQualityGateReport(dirtyEdges, routeNodes, 'polished');
    vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges').mockReturnValue(dirtyEdges);
    vi.spyOn(
      displayFinalizer,
      'finalizeBaseReactFlowDisplayEdgesWithReport',
    ).mockReturnValueOnce({
      edges: dirtyEdges,
      report: dirtyReport,
      measuredRepairReachedFixedPoint: true,
    }).mockReturnValueOnce({ edges: dirtyEdges, report: dirtyReport });
    const measuredRepairSpy = vi.spyOn(
      measuredDisplayRepair,
      'repairBaseReactFlowMeasuredDisplayEdgesWithReport',
    ).mockReturnValue({ edges: dirtyEdges, report: dirtyReport });
    const request = {
      operation: 'route' as const,
      edges: cleanEdges,
      nodes: routeNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full' as const,
    };

    const fixedPointResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      ...request,
      requestId: 'measured-fixed-point',
    });
    expect(measuredRepairSpy).not.toHaveBeenCalled();
    expect(fixedPointResponse.phaseTrace).toContainEqual(expect.objectContaining({
      phase: 'measured-repair',
      resolution: 'hit',
      cacheHitCount: 1,
      evaluationCount: 0,
      scannedEdgePairCount: 0,
      scannedNodeCount: 0,
      scannedSegmentCount: 0,
    }));
    const repeatedResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      ...request,
      requestId: 'measured-repeated-baseline',
    });

    expect(measuredRepairSpy).toHaveBeenCalledOnce();
    expect({
      edges: fixedPointResponse.edges,
      hardClean: fixedPointResponse.hardClean,
      routeResolution: fixedPointResponse.routeResolution,
    }).toEqual({
      edges: repeatedResponse.edges,
      hardClean: repeatedResponse.hardClean,
      routeResolution: repeatedResponse.routeResolution,
    });
  });

  it('retains the second Worker repair when the dirty route is progressing', () => {
    const dirtyReport = getDisplayHardQualityGateReport(dirtyEdges, routeNodes, 'polished');
    const cleanReport = getDisplayHardQualityGateReport(cleanEdges, routeNodes, 'polished');
    vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges').mockReturnValue(dirtyEdges);
    vi.spyOn(
      displayFinalizer,
      'finalizeBaseReactFlowDisplayEdgesWithReport',
    ).mockReturnValue({ edges: dirtyEdges, report: dirtyReport });
    const measuredRepairSpy = vi.spyOn(
      measuredDisplayRepair,
      'repairBaseReactFlowMeasuredDisplayEdgesWithReport',
    ).mockReturnValue({ edges: cleanEdges, report: cleanReport });

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'measured-progressing',
      edges: cleanEdges,
      nodes: routeNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
    });

    expect(measuredRepairSpy).toHaveBeenCalledOnce();
    expect(response).toMatchObject({
      edges: cleanEdges,
      hardClean: true,
      routeResolution: 'full-route-repaired',
    });
  });
});
