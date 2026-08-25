// @vitest-environment jsdom

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
import {
  computeBaseReactFlowDisplayEdgesWorkerResponse,
  handleBaseReactFlowDisplayWorkerMessage,
} from '../baseReactFlowDisplayEdges.worker';
import * as declaredRoleRepair from '../baseReactFlowDeclaredTerminalRoleRepair';
import * as endpointStubRepair from '../baseReactFlowDisplayEndpointStubRepair';
import * as displayFinalizer from '../baseReactFlowDisplayFinalizer';
import * as fullRoutePipeline from '../baseReactFlowDisplayFullRoutePipeline';
import * as finalEndpointOrder from '../baseReactFlowDisplayFinalEndpointOrder';
import * as finalSafetyClosure from '../baseReactFlowDisplayFinalSafetyClosure';
import * as measuredDisplayRepair from '../baseReactFlowDisplayMeasuredRepair';
import * as outerPortTransaction from '../baseReactFlowDisplayOuterPortTransaction';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import * as renderTerminalSafety from '../baseReactFlowRenderTerminalSafety';
import * as terminalPortRepair from '../baseReactFlowDisplayTerminalPortRepair';
import {
  createBaseReactFlowDisplayEdgePatches,
  mergeTrustedBaseReactFlowDisplayCacheEntry,
  resolveBaseReactFlowDisplayedEdges,
} from '../baseReactFlowDisplayWorkerClient';
import { shouldEscalateInteractiveDisplayRoute } from '../baseReactFlowDisplayWorkerFallback';

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
    type: 'stablePath',
    data: {
      autoSource: false,
      autoTarget: false,
      computedPath: [
        { x: 100, y: 30 },
        { x: 300, y: 30 },
      ],
      layoutDirection: 'LR',
      layoutPathLocked: true,
      _layoutPathLocked: true,
      runtimeHandleLock: { source: true, target: true },
    },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('baseReactFlowDisplayEdges worker pipeline', () => {
  it('rejects malformed worker messages before they reach routing code', () => {
    expect(handleBaseReactFlowDisplayWorkerMessage(null)).toEqual({
      requestId: 'invalid-request',
      error: 'display-edge-worker-invalid-request',
    });
    expect(handleBaseReactFlowDisplayWorkerMessage({
      operation: 'repair',
      requestId: 'invalid-repair',
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      nodes: [{ id: 'source', position: { x: Number.NaN, y: 0 }, data: {} }],
    })).toEqual({
      requestId: 'invalid-repair',
      error: 'display-edge-worker-invalid-request',
    });
  });

  it('commits a clean cache candidate without entering the full-route pipeline', () => {
    const fullRouteSpy = vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges');
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'validate-clean-cache',
      edges,
      candidatePatches: edges,
      candidateSource: 'persistent',
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
    });

    expect(response).toMatchObject({
      requestId: 'validate-clean-cache',
      edges,
      hardClean: true,
      routeResolution: 'validated-candidate',
    });
    expect(response.phaseTrace).toEqual([
      expect.objectContaining({
        phase: 'candidate-validation',
        resolution: 'hit',
      }),
      expect.objectContaining({ phase: 'final-clearance', resolution: 'skip' }),
      expect.objectContaining({ phase: 'final-hard-safety', resolution: 'skip' }),
      expect.objectContaining({ phase: 'session-commit', resolution: 'skip' }),
    ]);
    expect(fullRouteSpy).not.toHaveBeenCalled();
  });

  it('keeps an exact validated route without repeating the final safety closure', () => {
    const closureSpy = vi.spyOn(
      finalSafetyClosure,
      'repairBaseReactFlowFinalSafetyClosure',
    ).mockImplementation(candidateEdges => candidateEdges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        endpointOrderRepaired: false,
      },
    })));

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'validate-idempotent-safety-closure',
      edges,
      candidateEdges: edges,
      candidateSource: 'precompiled',
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
    });

    expect(response).toMatchObject({
      requestId: 'validate-idempotent-safety-closure',
      edges,
      hardClean: true,
      routeResolution: 'validated-candidate',
      hardReport: {
        hardClean: true,
        minimumClearanceViolations: 0,
      },
    });
    expect(closureSpy).not.toHaveBeenCalled();
  });

  it('locks a validated smart candidate to the computed-path renderer', () => {
    const smartCandidate = edges.map(edge => ({
      ...edge,
      type: 'advanced-smart-step',
      data: {
        ...edge.data,
        layoutPathLocked: false,
        _layoutPathLocked: false,
      },
    }));
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'validate-smart-render-contract',
      edges: smartCandidate,
      candidateEdges: smartCandidate,
      candidateSource: 'precompiled',
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
    });

    expect(response.routeResolution).toBe('repaired-candidate');
    expect(response.edges?.[0].type).toBe('stablePath');
    expect(response.edges?.[0].data?.layoutPathLocked).toBe(true);
    expect(response.edges?.[0].data?._layoutPathLocked).toBe(true);
  });

  it('reroutes invalid, stale, and malformed cache candidates in the same worker job', () => {
    const fullRouteSpy = vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges');
    const routeInput = {
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 2,
      qualityMode: 'full' as const,
    };
    const invalidCandidate = edges.map(edge => ({
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: [{ x: 100, y: 30 }, { x: 200, y: 80 }, { x: 300, y: 30 }],
      },
    }));
    let invalidCandidateReportCount = 0;
    const invalid = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'validate-invalid-cache',
      candidateEdges: invalidCandidate,
      candidateSource: 'persistent',
      ...routeInput,
    }, () => { invalidCandidateReportCount += 1; });
    expect(invalid.error).toBeUndefined();
    expect(invalid.edges).not.toEqual(invalidCandidate);
    expect(invalidCandidateReportCount).toBeGreaterThan(0);

    const stale = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'validate-stale-cache',
      candidateEdges: [{ ...edges[0], id: 'stale-edge' }],
      candidateSource: 'persistent',
      ...routeInput,
    });
    expect(stale.error).toBeUndefined();

    const malformed = handleBaseReactFlowDisplayWorkerMessage({
      operation: 'validate-or-route',
      requestId: 'validate-malformed-cache',
      candidateSource: 'persistent',
      candidateEdges: [{
        ...edges[0],
        data: { computedPath: [{ x: Number.NaN, y: 0 }] },
      }],
      ...routeInput,
    });
    expect(malformed.error).toBeUndefined();
    expect(fullRouteSpy).toHaveBeenCalledTimes(3);
  });

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
      operation: 'route',
      requestId: 'worker-direct-parity',
      ...input,
      qualityMode: 'full',
    });

    expect(finalizeSpy).toHaveBeenCalledTimes(1);
    expect(finalizeSpy.mock.calls[0]?.[2]).toMatchObject({
      inputNodes: nodes,
      outputRouteSignature: expect.stringMatching(/^route-v2:/),
      report: expect.objectContaining({ candidate: 'polished' }),
    });
    expect(workerResponse).toMatchObject({
      requestId: 'worker-direct-parity',
      edges: direct,
      hardClean: true,
      routeResolution: 'full-route',
    });
    expect(workerResponse.phaseTrace?.map(trace => trace.phase)).toEqual([
      'candidate-validation',
      'seed',
      'seed-initial-gate',
      'finalizer',
      'final-clearance',
      'final-hard-safety',
      'final-safety-hard-gate',
      'final-safety-stubs',
      'final-safety-endpoint-order',
      'final-safety-passage-order',
      'final-safety-closure',
      'final-commercial-safety-closure',
      'session-commit',
    ]);
  });

  it('returns one final response when a full route needs measured repair', () => {
    const uncleanEdges: Edge[] = [{
      ...edges[0],
      data: {
        ...(edges[0].data || {}),
        computedPath: [
          { x: 100, y: 30 },
          { x: 200, y: 80 },
          { x: 300, y: 30 },
        ],
      },
    }];
    const uncleanReport = getDisplayHardQualityGateReport(uncleanEdges, nodes, 'polished');
    const repairedReport = getDisplayHardQualityGateReport(edges, nodes, 'polished');
    expect(uncleanReport.hardClean).toBe(false);
    expect(repairedReport.hardClean).toBe(true);
    vi.spyOn(fullRoutePipeline, 'createBaseReactFlowFullRouteEdges').mockReturnValue(uncleanEdges);
    vi.spyOn(displayFinalizer, 'finalizeBaseReactFlowDisplayEdgesWithReport').mockReturnValue({
      edges: uncleanEdges,
      report: uncleanReport,
    });
    const repairSpy = vi.spyOn(
      measuredDisplayRepair,
      'repairBaseReactFlowMeasuredDisplayEdgesWithReport',
    ).mockReturnValue({
      edges,
      report: repairedReport,
    });

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'route',
      requestId: 'worker-full-route-repaired',
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 102,
      qualityMode: 'full',
    });

    expect(repairSpy).toHaveBeenCalledOnce();
    expect(repairSpy).toHaveBeenCalledWith(
      uncleanEdges,
      nodes,
      expect.objectContaining({
        edges: uncleanEdges,
        inputNodes: nodes,
        report: uncleanReport,
      }),
      false,
      expect.any(Function),
      false,
    );
    expect(response).toMatchObject({
      requestId: 'worker-full-route-repaired',
      edges,
      hardClean: true,
      routeResolution: 'full-route-repaired',
    });
    expect(response.phaseTrace).toContainEqual(expect.objectContaining({
      phase: 'measured-repair',
      resolution: 'accepted',
    }));
    expect(response.phaseTrace).toContainEqual(expect.objectContaining({
      phase: 'final-safety-closure',
      resolution: 'skip',
    }));
    expect(response.phaseTrace?.at(-1)).toMatchObject({
      phase: 'session-commit',
      resolution: 'skip',
    });
  });

  it('routes only incident edges from a verified committed baseline', () => {
    const endpointOrderRepairSpy = vi.spyOn(
      finalEndpointOrder,
      'repairBaseReactFlowFinalEndpointOrder',
    );
    const baselineSourceEdges: Edge[] = edges.map(edge => ({
      ...edge,
      data: { ...(edge.data || {}) },
    }));
    const baselineRoutedEdges: Edge[] = baselineSourceEdges.map(edge => ({
      ...edge,
      data: { ...(edge.data || {}) },
    }));
    const nextNodes: Node[] = [
      nodes[0],
      { ...nodes[1], position: { x: 320, y: 0 } },
    ];
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(
      baselineSourceEdges,
      baselineRoutedEdges,
    );
    const baselineOutputRouteSignature =
      computeBaseReactFlowDisplayOutputRouteSignature(baselineRoutedEdges);
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected valid incremental baseline');
    }
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges: baselineSourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: nextNodes,
      edges: baselineSourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: nodes,
      previousEdges: baselineSourceEdges,
      nextNodes,
      nextEdges: baselineSourceEdges,
      reasonHint: 'node-drag',
    });
    const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: nodes,
      nextNodes,
      baselineEdges: baselineRoutedEdges,
      nextEdges: baselineSourceEdges,
    });

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'incremental-route',
      edges: baselineSourceEdges,
      nodes: nextNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 103,
      qualityMode: 'full',
      baselineInputSignature: baselineIdentity.cacheSignature,
      baselineInputGeometryDigest: baselineIdentity.geometryDigest,
      baselineNodes: nodes,
      baselineSourceEdges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: nextIdentity.cacheSignature,
      nextInputGeometryDigest: nextIdentity.geometryDigest,
      changeSet,
      mutableEdgeIds: affectedClosure.mutableEdgeIds,
      contextEdgeIds: affectedClosure.contextEdgeIds,
    });

    expect(
      response,
      JSON.stringify({
        phaseTrace: response.phaseTrace,
        report: response.edges
          ? getDisplayHardQualityGateReport(response.edges, nextNodes, 'polished')
          : null,
      }),
    ).toMatchObject({
      requestId: 'incremental-route',
      hardClean: true,
      routeResolution: 'incremental-route',
      affectedEdgeCount: 1,
      fallbackLevel: 'none',
    });
    expect(response.phaseTrace?.map(trace => trace.phase)).toEqual(expect.arrayContaining([
      'incremental-closure',
      'local-route',
      'hard-gate',
    ]));
    expect(response.phaseTrace?.find(trace => trace.phase === 'incremental-closure'))
      .toMatchObject({ cacheHitCount: 0 });
    expect(response.phaseTrace?.find(trace => trace.phase === 'final-safety-hard-gate'))
      .toMatchObject({
        evaluationCount: 0,
        cacheHitCount: 1,
        scannedNodeCount: 0,
        scannedEdgePairCount: 0,
      });
    const phaseOrder = response.phaseTrace?.map(trace => trace.phase) ?? [];
    expect(phaseOrder.indexOf('final-safety-hard-gate'))
      .toBeLessThan(phaseOrder.indexOf('final-endpoint-seed'));
    expect(endpointOrderRepairSpy).not.toHaveBeenCalled();
  });

  it('falls back to the full route in the same job when incremental hints are stale', () => {
    const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes,
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const baselinePatches = createBaseReactFlowDisplayEdgePatches(edges, edges);
    const baselineOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
    if (!baselinePatches || !baselineOutputRouteSignature) {
      throw new Error('expected valid incremental fallback baseline');
    }
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'incremental-route',
      requestId: 'incremental-full-fallback',
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 104,
      qualityMode: 'full',
      baselineInputSignature: baselineIdentity.cacheSignature,
      baselineInputGeometryDigest: baselineIdentity.geometryDigest,
      baselineNodes: nodes,
      baselineSourceEdges: edges,
      baselinePatches,
      baselineOutputRouteSignature,
      nextInputSignature: baselineIdentity.cacheSignature,
      nextInputGeometryDigest: baselineIdentity.geometryDigest,
      changeSet: {
        reason: 'node-drag',
        classification: 'geometry',
        changedNodeIds: ['source'],
        changedEdgeIds: [],
        topologyChanged: false,
        geometryChanged: true,
      },
      mutableEdgeIds: ['edge'],
      contextEdgeIds: [],
    });

    expect(response.hardClean).toBe(true);
    expect(response.routeResolution).toMatch(/^full-route/);
    expect(response).toMatchObject({
      affectedEdgeCount: 0,
      fallbackLevel: 'full',
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

  it('repairs an isolated declared-axis mismatch before entering measured repair', () => {
    const axisNodes: Node[] = [
      { id: 'axis-source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
      { id: 'axis-target', position: { x: 300, y: 400 }, width: 100, height: 60, data: {} },
    ];
    const axisEdges: Edge[] = [{
      id: 'axis-edge',
      source: 'axis-source',
      target: 'axis-target',
      sourceHandle: 'bottom',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 430 },
        ],
      },
    }];
    const initialReport = getDisplayHardQualityGateReport(axisEdges, axisNodes, 'polished');
    const measuredRepair = vi.spyOn(
      measuredDisplayRepair,
      'repairBaseReactFlowMeasuredDisplayEdgesWithReport',
    );
    const terminalAxisRepair = vi.spyOn(
      terminalPortRepair,
      'repairAxisMismatchedTerminalsWithBoundedPortRoles',
    );

    const finalized = displayFinalizer.finalizeBaseReactFlowDisplayEdgesWithReport(
      axisEdges,
      axisNodes,
    );

    expect(initialReport).toMatchObject({
      hardClean: false,
      terminalsAttached: true,
      terminalsAnchored: false,
    });
    expect(finalized.report.hardClean).toBe(true);
    expect(finalized.report.terminalsAnchored).toBe(true);
    expect(terminalAxisRepair).toHaveBeenCalled();
    expect(measuredRepair).not.toHaveBeenCalled();
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
      operation: 'route',
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

  it('escalates an interactive route unless its exact final report is hard clean', () => {
    expect(shouldEscalateInteractiveDisplayRoute({ hardClean: true })).toBe(false);
    expect(shouldEscalateInteractiveDisplayRoute({ hardClean: false })).toBe(true);
    expect(shouldEscalateInteractiveDisplayRoute({})).toBe(true);
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

  it('revalidates persisted cache patches in the worker before final-only display', async () => {
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

    const evaluateCachedPath = async (
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
        inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
        outputRouteSignature: outputRouteSignature!,
      });
      const cachedEntry = readBaseReactFlowDisplayEdgesCacheEntry(
        signature,
        `geometry-v1:${'a'.repeat(32)}`,
      );
      expect(cachedEntry?.hardClean).toBe(true);
      const candidate = cachedEntry
        ? mergeTrustedBaseReactFlowDisplayCacheEntry([sourceEdge], cachedEntry)
        : null;
      expect((candidate?.[0].data as any)?.businessMetadata).toEqual({ owner: 'current' });
      expect(candidate).not.toBeNull();
      if (!candidate) throw new Error('expected a signed routing-only cache candidate');
      const response = await computeBaseReactFlowDisplayEdgesWorkerResponse({
        operation: 'validate-or-route',
        requestId: signature,
        edges: [sourceEdge],
        candidateEdges: candidate,
        candidateSource: 'persistent',
        nodes: candidateNodes,
        enableSmartEdges: true,
        smartEdgePadding: 20,
        isLargeGraph: false,
        displayEdgeEpoch: 1,
        qualityMode: 'full',
      });
      return { candidate, response };
    };

    const good = await evaluateCachedPath(
      '930000001',
      [
        { x: 100, y: 30 },
        { x: 300, y: 30 },
      ],
      nodes,
    );
    expect(good.response).toMatchObject({
      requestId: '930000001',
      edges: good.candidate,
      hardClean: true,
      routeResolution: 'repaired-candidate',
    });
    expect(good.response.edges?.[0].data).toMatchObject({
      layoutPathLocked: true,
      _layoutPathLocked: true,
    });
    expect(resolveBaseReactFlowDisplayedEdges({
      signature: '930000001',
      geometryDigest: 'digest-good',
      policyMode: 'full',
      deferred: null,
      cached: null,
      immediate: [sourceEdge],
    })).toEqual([sourceEdge]);
    expect(resolveBaseReactFlowDisplayedEdges({
      signature: '930000001',
      geometryDigest: 'digest-good',
      policyMode: 'full',
      deferred: {
        signature: '930000001',
        geometryDigest: 'digest-good',
        displayPatches: createBaseReactFlowDisplayEdgePatches(
          [sourceEdge],
          good.response.edges!,
        )!,
        hardClean: true,
      },
      cached: null,
      immediate: [sourceEdge],
    })).toEqual(good.response.edges);

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
    const obstacleHit = await evaluateCachedPath(
      '930000002',
      [
        { x: 100, y: 30 },
        { x: 300, y: 30 },
      ],
      obstacleNodes,
    );
    const wrongHandleAxis = await evaluateCachedPath(
      '930000003',
      [
        { x: 100, y: 30 },
        { x: 100, y: 90 },
        { x: 300, y: 90 },
        { x: 300, y: 30 },
      ],
      nodes,
    );
    const detached = await evaluateCachedPath(
      '930000004',
      [
        { x: 120, y: 30 },
        { x: 280, y: 30 },
      ],
      nodes,
    );

    for (const rejected of [obstacleHit, wrongHandleAxis, detached]) {
      expect(rejected.response.edges).toBeDefined();
      expect(rejected.response.edges).not.toEqual(rejected.candidate);
      expect(typeof rejected.response.hardClean).toBe('boolean');
      expect(['full-route', 'full-route-repaired']).toContain(
        rejected.response.routeResolution,
      );
    }
  });
});
