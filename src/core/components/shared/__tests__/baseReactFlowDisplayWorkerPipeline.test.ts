import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  baseReactFlowDisplayHardQualityIsClean,
  createBaseReactFlowDisplayEdges,
} from '../baseReactFlowDisplayEdges';
import {
  computeBaseReactFlowDisplayOutputRouteSignature,
  readBaseReactFlowDisplayEdgesCacheEntry,
  withDisplayAbsolutePositions,
  writeBaseReactFlowDisplayEdgesCache,
} from '../baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import * as declaredRoleRepair from '../baseReactFlowDeclaredTerminalRoleRepair';
import * as endpointStubRepair from '../baseReactFlowDisplayEndpointStubRepair';
import * as displayFinalizer from '../baseReactFlowDisplayFinalizer';
import * as measuredDisplayRepair from '../baseReactFlowDisplayMeasuredRepair';
import * as outerPortTransaction from '../baseReactFlowDisplayOuterPortTransaction';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import * as renderTerminalSafety from '../baseReactFlowRenderTerminalSafety';
import * as terminalPortRepair from '../baseReactFlowDisplayTerminalPortRepair';
import {
  createBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayEdgePatches,
  resolveBaseReactFlowDisplayedEdges,
} from '../baseReactFlowDisplayWorkerClient';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: { layoutDirection: 'LR' },
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
];

const edges: Edge[] = [
  {
    id: 'edge',
    source: 'source',
    target: 'target',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'advanced-smart-step',
    data: {
      autoSource: false,
      autoTarget: false,
      computedPath: [
        { x: 100, y: 30 },
        { x: 148, y: 30 },
        { x: 252, y: 30 },
        { x: 300, y: 30 },
      ],
      layoutDirection: 'LR',
      layoutPathLocked: true,
      runtimeHandleLock: { source: true, target: true },
    },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('baseReactFlowDisplayEdges worker pipeline', () => {
  it('runs the shared finalizer and matches the direct final display route', () => {
    const input = {
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 101,
    };
    const direct = createBaseReactFlowDisplayEdges(input);
    const finalizeSpy = vi.spyOn(
      displayFinalizer,
      'finalizeBaseReactFlowDisplayEdgesWithReport',
    );
    const workerResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      requestId: 'worker-direct-parity',
      ...input,
      qualityMode: 'full',
    });

    expect(finalizeSpy).toHaveBeenCalledTimes(1);
    expect(workerResponse).toEqual({
      requestId: 'worker-direct-parity',
      edges: direct,
      hardClean: true,
    });
  });

  it('reuses an exact route report in the shared finalizer outcome', () => {
    const compactEdges: Edge[] = [{
      ...edges[0],
      data: {
        ...(edges[0].data || {}),
        computedPath: [
          { x: 100, y: 30 },
          { x: 300, y: 30 },
        ],
      },
    }];
    const repairNodes = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(node => [node.id, node] as const)),
    );
    const report = getDisplayHardQualityGateReport(compactEdges, repairNodes, 'polished');
    expect(report.hardClean).toBe(true);
    const exactReport = displayFinalizer.createBaseReactFlowDisplayExactReport(
      compactEdges,
      nodes,
      repairNodes,
      report,
    );

    const finalized = displayFinalizer.finalizeBaseReactFlowDisplayEdgesWithReport(
      compactEdges,
      nodes,
      exactReport,
    );

    expect(finalized.edges).toBe(compactEdges);
    expect(finalized.report).toBe(report);
  });

  it('keeps an atomic 48px hard-clean route as baseline while applying the 56px preference', () => {
    const atomic48 = edges.map(edge => ({
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: [
          { x: 100, y: 30 },
          { x: 148, y: 30 },
          { x: 252, y: 30 },
          { x: 300, y: 30 },
        ],
      },
    }));
    const broken = atomic48.map(edge => ({
      ...edge,
      id: `${edge.id}-broken`,
      data: {
        ...(edge.data || {}),
        computedPath: [
          { x: 100, y: 30 },
          { x: 148, y: 30 },
          { x: 148, y: 80 },
          { x: 350, y: 80 },
          { x: 350, y: 30 },
          { x: 300, y: 30 },
        ],
      },
    }));
    const brokenReport = getDisplayHardQualityGateReport(broken, nodes, 'polished');
    expect(brokenReport.hardClean).toBe(false);
    expect(getDisplayHardQualityGateReport(atomic48, nodes, 'polished').hardClean).toBe(true);
    expect(endpointStubRepair.countRenderUnsafeEndpointStubs(atomic48)).toBe(2);
    const forcedOuterTransactionReport = {
      ...brokenReport,
      hardClean: false,
      terminalsAttached: true,
      terminalsAnchored: true,
      quality: { ...brokenReport.quality, strictCrossings: 1 },
    };
    vi.spyOn(measuredDisplayRepair, 'repairBaseReactFlowMeasuredDisplayEdgesWithReport')
      .mockReturnValue({ edges: broken, report: forcedOuterTransactionReport });
    const outerTransaction = vi.spyOn(
      outerPortTransaction,
      'repairResidualOuterPortTransactionWithHardGate',
    ).mockImplementation((candidate) => (
      candidate === broken ? atomic48 : candidate
    ));

    const finalized = displayFinalizer.finalizeBaseReactFlowDisplayEdgesWithReport(
      broken,
      nodes,
    );

    expect(finalized.report.hardClean).toBe(true);
    expect(endpointStubRepair.countRenderUnsafeEndpointStubs(finalized.edges)).toBe(0);
    expect(outerTransaction).toHaveBeenCalledTimes(1);
  });

  it('preserves the atomic 48px hard-clean route when the 56px preference cannot commit', () => {
    const atomic48 = edges.map(edge => ({
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: [
          { x: 100, y: 30 },
          { x: 148, y: 30 },
          { x: 252, y: 30 },
          { x: 300, y: 30 },
        ],
      },
    }));
    const broken = atomic48.map(edge => ({
      ...edge,
      id: `${edge.id}-broken`,
      data: {
        ...(edge.data || {}),
        computedPath: [
          { x: 100, y: 30 },
          { x: 148, y: 30 },
          { x: 148, y: 80 },
          { x: 350, y: 80 },
          { x: 350, y: 30 },
          { x: 300, y: 30 },
        ],
      },
    }));
    const brokenReport = getDisplayHardQualityGateReport(broken, nodes, 'polished');
    expect(brokenReport.hardClean).toBe(false);
    expect(getDisplayHardQualityGateReport(atomic48, nodes, 'polished').hardClean).toBe(true);
    const forcedOuterTransactionReport = {
      ...brokenReport,
      hardClean: false,
      terminalsAttached: true,
      terminalsAnchored: true,
      quality: { ...brokenReport.quality, strictCrossings: 1 },
    };
    vi.spyOn(measuredDisplayRepair, 'repairBaseReactFlowMeasuredDisplayEdgesWithReport')
      .mockReturnValue({ edges: broken, report: forcedOuterTransactionReport });
    const outerTransaction = vi.spyOn(
      outerPortTransaction,
      'repairResidualOuterPortTransactionWithHardGate',
    ).mockReturnValue(atomic48);
    const renderPreference = vi.spyOn(endpointStubRepair, 'repairRenderSafeEndpointStubs')
      .mockImplementation(candidate => candidate);
    const renderAxisRepair = vi.spyOn(renderTerminalSafety, 'repairRenderSafeTerminalAxes')
      .mockImplementation(candidate => candidate);
    const declaredRepair = vi.spyOn(
      declaredRoleRepair,
      'repairDeclaredTerminalRolesWithHardGate',
    ).mockImplementation(candidate => candidate);
    const terminalAxisRepair = vi.spyOn(
      terminalPortRepair,
      'repairAxisMismatchedTerminalsWithBoundedPortRoles',
    ).mockImplementation(candidate => candidate);

    const finalized = displayFinalizer.finalizeBaseReactFlowDisplayEdgesWithReport(broken, nodes);

    expect(renderPreference).toHaveBeenCalledTimes(1);
    expect(outerTransaction).toHaveBeenCalledTimes(1);
    expect(renderAxisRepair).not.toHaveBeenCalled();
    expect(declaredRepair).not.toHaveBeenCalled();
    expect(terminalAxisRepair).not.toHaveBeenCalled();
    expect(finalized.edges).toBe(atomic48);
    expect(finalized.report.hardClean).toBe(true);
  });

  it('reports a genuinely clean interactive result as hard clean', () => {
    const workerResponse = computeBaseReactFlowDisplayEdgesWorkerResponse({
      requestId: 'interactive-hard-clean',
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: true,
      displayEdgeEpoch: 102,
      qualityMode: 'interactive',
    });

    expect(workerResponse.hardClean).toBe(true);
    expect(baseReactFlowDisplayHardQualityIsClean(workerResponse.edges ?? [], nodes)).toBe(true);
  });

  it('enforces declared terminal axes on both sides of the former 24-edge boundary', () => {
    const buildGraph = (edgeCount: number, wrongTerminalAxis: boolean) => {
      const graphNodes: Node[] = [];
      const graphEdges: Edge[] = [];
      for (let index = 0; index < edgeCount; index += 1) {
        const y = index * 120;
        graphNodes.push(
          {
            id: `source-${index}`,
            position: { x: 0, y },
            measured: { width: 100, height: 60 },
            data: {},
          },
          {
            id: `target-${index}`,
            position: { x: 300, y },
            measured: { width: 100, height: 60 },
            data: {},
          },
        );
        const centerY = y + 30;
        graphEdges.push({
          id: `edge-${index}`,
          source: `source-${index}`,
          target: `target-${index}`,
          sourceHandle: 'right',
          targetHandle: 'left',
          data: {
            computedPath: wrongTerminalAxis && index === edgeCount - 1
              ? [
                { x: 100, y: centerY },
                { x: 100, y: centerY + 48 },
                { x: 300, y: centerY + 48 },
                { x: 300, y: centerY },
              ]
              : [
                { x: 100, y: centerY },
                { x: 300, y: centerY },
              ],
          },
        });
      }
      return { graphNodes, graphEdges };
    };

    for (const edgeCount of [24, 25]) {
      const clean = buildGraph(edgeCount, false);
      const wrong = buildGraph(edgeCount, true);
      expect(baseReactFlowDisplayHardQualityIsClean(clean.graphEdges, clean.graphNodes)).toBe(true);
      expect(baseReactFlowDisplayHardQualityIsClean(wrong.graphEdges, wrong.graphNodes)).toBe(false);
    }
  });

  it('revalidates hard-clean cache patches after merging them onto current edges', () => {
    window.localStorage.clear();
    const sourceEdge: Edge = {
      id: 'cached-edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'advanced-smart-step',
      data: {
        businessMetadata: { owner: 'current' },
      },
    };

    const evaluateCachedPath = (
      signature: string,
      computedPath: Array<{ x: number; y: number }>,
      candidateNodes: Node[],
    ) => {
      const routedEdge: Edge = {
        ...sourceEdge,
        type: 'stablePath',
        data: {
          ...sourceEdge.data,
          computedPath,
        },
      };
      const patches = createBaseReactFlowDisplayEdgePatches([sourceEdge], [routedEdge]);
      expect(patches).not.toBeNull();
      if (!patches) throw new Error('expected a cacheable routing patch');

      // Cache metadata is advisory: a structurally valid payload can still carry stale or
      // forged hardClean=true geometry, so the merged result must pass the current hard gate.
      const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature([routedEdge]);
      expect(outputRouteSignature).not.toBeNull();
      writeBaseReactFlowDisplayEdgesCache(signature, patches, {
        hardClean: true,
        outputRouteSignature: outputRouteSignature!,
      });
      const cachedEntry = readBaseReactFlowDisplayEdgesCacheEntry(signature);
      expect(cachedEntry?.hardClean).toBe(true);
      const merged = cachedEntry
        ? mergeBaseReactFlowDisplayEdgePatches([sourceEdge], cachedEntry.edges)
        : null;
      expect((merged?.[0].data as any)?.businessMetadata).toEqual({ owner: 'current' });
      const safeCached = merged && baseReactFlowDisplayHardQualityIsClean(merged, candidateNodes)
        ? merged
        : null;
      return { merged, safeCached };
    };

    const good = evaluateCachedPath(
      'cache-quality-good',
      [
        { x: 100, y: 30 },
        { x: 148, y: 30 },
        { x: 252, y: 30 },
        { x: 300, y: 30 },
      ],
      nodes,
    );
    expect(good.safeCached).toEqual(good.merged);
    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'cache-quality-good',
      policyMode: 'full',
      deferred: null,
      cached: good.safeCached,
      immediate: [sourceEdge],
    })).toEqual(good.merged);

    const obstacleNodes: Node[] = [
      nodes[0],
      {
        id: 'unrelated-blocker',
        position: { x: 140, y: -10 },
        measured: { width: 120, height: 80 },
        data: {},
      },
      nodes[1],
    ];
    const obstacleHit = evaluateCachedPath(
      'cache-quality-obstacle',
      [
        { x: 100, y: 30 },
        { x: 300, y: 30 },
      ],
      obstacleNodes,
    );
    const wrongHandleAxis = evaluateCachedPath(
      'cache-quality-wrong-handle',
      [
        { x: 100, y: 30 },
        { x: 100, y: 90 },
        { x: 300, y: 90 },
        { x: 300, y: 30 },
      ],
      nodes,
    );
    const detached = evaluateCachedPath(
      'cache-quality-detached',
      [
        { x: 120, y: 30 },
        { x: 280, y: 30 },
      ],
      nodes,
    );

    for (const rejected of [obstacleHit, wrongHandleAxis, detached]) {
      expect(rejected.merged).not.toBeNull();
      expect(rejected.safeCached).toBeNull();
      expect(resolveBaseReactFlowDisplayedEdges({
        signature: 'cache-quality-rejected',
        policyMode: 'full',
        deferred: null,
        cached: rejected.safeCached,
        immediate: [sourceEdge],
      })).toEqual([]);
    }
  });
});
