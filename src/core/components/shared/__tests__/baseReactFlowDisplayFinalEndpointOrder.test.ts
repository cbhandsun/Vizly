import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { edgeTerminalPositionIsFixed } from '../../../routing/utils/edgeTerminalPolicy';
import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  changedEdgesObstacleHitsDoNotRegress,
  countDisplayObstacleHits,
  visualPolishHardQualityDoesNotRegress,
} from '../baseReactFlowDisplayEvaluation';
import { scoreNodeClearanceRisk } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import { repairDisplayContainerBoundaryClearanceRisks } from '../../../strategies/shared/edgeDisplaySoftQualityRepair';
import { repairOverextendedTargetTrunkCorridors } from '../../../strategies/shared/edgeOverextendedTargetTrunkRepair';
import { withDisplayAbsolutePositions } from '../baseReactFlowDisplayEdgeCore';
import {
  repairBaseReactFlowFinalCommercialDetours,
  repairBaseReactFlowFinalEndpointOrder,
} from '../baseReactFlowDisplayFinalEndpointOrder';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { resolveBaseReactFlowEvaluationNodes } from '../baseReactFlowDisplayEvaluationNodes';
import { passesBaseReactFlowFinalDisplayGate } from '../baseReactFlowDisplayFinalEndpointGate';
import {
  findDisplayStrictCrossingHits,
  getDisplayNodeRect,
} from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import {
  buildTerminalPreservingDirectShortcutCandidates,
} from '../baseReactFlowDisplayLoopShortcutRepair';
import { repairBaseReactFlowResidualOverlapAxisClosure } from '../baseReactFlowDisplayResidualOverlapClosure';
import { parseBaseReactFlowPrecompiledRouteArtifact } from '../baseReactFlowPrecompiledRouteArtifact';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from '../baseReactFlowDisplayTerminalPortCandidates';
import { preservesCommercialTrueTrunkMembership } from '../baseReactFlowDisplayTrueTrunkContract';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from '../baseReactFlowTerminalAxisRepair';
import { GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS } from '../generated/baseReactFlowPrecompiledRouteLoaders';
import {
  browserLogisticsNodes,
  restoreBrowserColdRequestRouteHandles,
} from './fixtures/logisticsBrowserRoutingFixture';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';

type Point = { x: number; y: number };

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
});

const edge = (
  id: string,
  target: string,
  computedPath: Point[],
): Edge => ({
  id,
  source: 'hub',
  target,
  sourceHandle: 'bottom',
  targetHandle: 'top',
  type: 'advanced-smart-step',
  data: { computedPath },
});

const pathOf = (value: Edge | undefined): Point[] => {
  const path = value?.data && typeof value.data === 'object' && !Array.isArray(value.data)
    ? (value.data as Record<string, unknown>).computedPath
    : undefined;
  return Array.isArray(path) ? path as Point[] : [];
};

const fixture = (): { nodes: Node[]; edges: Edge[] } => ({
  nodes: [
    node('hub', 0, 0, 300, 100),
    node('left', 0, 400, 60, 60),
    node('right', 240, 400, 60, 60),
  ],
  edges: [
    edge('left-edge', 'left', [
      { x: 240, y: 100 },
      { x: 240, y: 160 },
      { x: 30, y: 160 },
      { x: 30, y: 400 },
    ]),
    edge('right-edge', 'right', [
      { x: 60, y: 100 },
      { x: 60, y: 200 },
      { x: 270, y: 200 },
      { x: 270, y: 400 },
    ]),
  ],
});

describe('base React Flow final endpoint order transaction', () => {
  it('reuses only the supplied evaluation node snapshot', () => {
    const rawNodes: Node[] = [{
      id: 'source',
      position: { x: 10, y: 20 },
      width: 100,
      height: 60,
      data: {},
    }];
    const sessionNodes: Node[] = [{
      ...rawNodes[0],
      position: { x: 110, y: 220 },
    }];
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(sessionNodes);

    expect(resolveBaseReactFlowEvaluationNodes(rawNodes, evaluation))
      .toBe(sessionNodes);
    const independentlyProjected = resolveBaseReactFlowEvaluationNodes(rawNodes);
    expect(independentlyProjected).not.toBe(rawNodes);
    expect(independentlyProjected).not.toBe(sessionNodes);

    const nextSessionNodes = sessionNodes.map(node => ({
      ...node,
      position: { x: node.position.x + 1, y: node.position.y },
    }));
    const nextEvaluation = createBaseReactFlowFinalEndpointEvaluation(nextSessionNodes);
    expect(resolveBaseReactFlowEvaluationNodes(rawNodes, nextEvaluation))
      .toBe(nextSessionNodes);
  });

  it('exposes reusable final evidence for a closure-ready commercial route', () => {
    const nodes = [
      node('hub', 0, 0, 100, 100),
      node('target', 300, 0, 100, 100),
    ];
    const edges: Edge[] = [{
      id: 'direct',
      source: 'hub',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [{ x: 100, y: 50 }, { x: 300, y: 50 }] },
    }];
    let closureReady = false;
    let evaluatedEdges: readonly Edge[] | undefined;
    const traces: DisplayRoutingPhaseTrace[] = [];

    const repaired = repairBaseReactFlowFinalCommercialDetours(edges, nodes, {
      onPhaseTrace: trace => traces.push(trace),
      onFinalEvaluation: evaluation => {
        evaluatedEdges = evaluation.edges;
        closureReady = evaluation.closureReady;
      },
    });

    expect(repaired).toBe(edges);
    expect(evaluatedEdges).toBe(repaired);
    expect(closureReady).toBe(true);
    const evaluationTrace = traces.find(trace => trace.phase === 'final-commercial-evaluation');
    expect(evaluationTrace).toMatchObject({
      candidateCount: 1,
      resolution: 'skip',
    });
    expect(
      (evaluationTrace?.evaluationCount ?? 0) + (evaluationTrace?.cacheHitCount ?? 0),
    ).toBeGreaterThan(0);
    expect([...new Set(traces.map(trace => trace.phase))]).toEqual(expect.arrayContaining([
      'final-commercial-clearance',
      'final-commercial-terminal-preserving',
      'final-commercial-source-stairs',
      'final-commercial-terminal-changing',
    ]));
  });

  it('does not certify an empty route as closure-ready', () => {
    let closureReady = true;
    const repaired = repairBaseReactFlowFinalCommercialDetours([], [], {
      onFinalEvaluation: evaluation => { closureReady = evaluation.closureReady; },
    });

    expect(repaired).toEqual([]);
    expect(closureReady).toBe(false);
  });

  it('accepts a shorter outer customs route only when its focused display contract stays clean', () => {
    const entry = Object.entries(GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS)
      .find(([, descriptor]) => descriptor.presetId === 'logistics-architecture-v1');
    if (!entry) throw new Error('expected the Logistics precompiled loader');
    const [inputSignature, descriptor] = entry;
    const artifact = parseBaseReactFlowPrecompiledRouteArtifact(
      getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1'), {
      inputSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      sourceHash: descriptor.sourceHash,
    });
    if (!artifact) throw new Error('expected the Logistics artifact to parse');
    const completeArtifactEdges = restoreBrowserColdRequestRouteHandles(artifact.edges)
      .filter(item => item.id === 'edge-loms-customs');
    const baseline = completeArtifactEdges.map(item => item.id === 'edge-loms-customs'
      ? {
        ...item,
        sourceHandle: 'right',
        targetHandle: 'top',
        data: { ...item.data, computedPath: [
          { x: 1_194, y: 593 },
          { x: 1_250, y: 593 },
          { x: 1_250, y: 394 },
          { x: 1_128.1125, y: 394 },
          { x: 1_128.1125, y: -108 },
          { x: 1_667, y: -108 },
          { x: 1_667, y: 823 },
        ] },
      }
      : item);
    const candidate = baseline.map(item => item.id === 'edge-loms-customs'
      ? {
        ...item,
        sourceHandle: 'right',
        targetHandle: 'top',
        data: { ...item.data, computedPath: [
          { x: 1_194, y: 593 },
          { x: 1_250, y: 593 },
          { x: 1_250, y: -108 },
          { x: 1_667, y: -108 },
          { x: 1_667, y: 823 },
        ] },
      }
      : item);
    const absoluteNodes = withDisplayAbsolutePositions(
      browserLogisticsNodes,
      new Map(browserLogisticsNodes.map(item => [item.id, item] as const)),
    );
    const report = getDisplayHardQualityGateReport(candidate, absoluteNodes, 'polished');
    const baselineQuality = calculateEdgePathQualityScore(baseline);
    const candidateQuality = calculateEdgePathQualityScore(candidate);
    const endpointOrder = auditFinalSameSideEndpointOrder(candidate, absoluteNodes);
    const passageOrder = auditFinalSameSidePassageOrder(candidate, absoluteNodes);
    const diagnostics = JSON.stringify({ report, baselineQuality, candidateQuality, endpointOrder, passageOrder }, null, 2);

    expect(report.hardClean, diagnostics).toBe(true);
    expect(candidateQuality.totalLength, diagnostics).toBeLessThan(baselineQuality.totalLength);
    expect(candidateQuality.detourPenalty, diagnostics).toBeLessThan(baselineQuality.detourPenalty);
    expect(endpointOrder.inversions, diagnostics).toBe(0);
    expect(endpointOrder.ambiguousLaneTies, diagnostics).toBe(0);
    expect(endpointOrder.collapsedLanePairs, diagnostics).toBe(0);
    expect(passageOrder.passageDefects, diagnostics).toBe(0);
    expect(
      buildTerminalPreservingDirectShortcutCandidates(
        pathOf(baseline.find(item => item.id === 'edge-loms-customs')),
      ),
      diagnostics,
    ).toContainEqual(pathOf(candidate.find(item => item.id === 'edge-loms-customs')));
    const reclaimed = repairOverextendedTargetTrunkCorridors(baseline, absoluteNodes);
    const combinedCandidate = reclaimed.map(item => item.id === 'edge-loms-customs'
      ? candidate.find(candidateEdge => candidateEdge.id === item.id) ?? item
      : item);
    expect(
      getDisplayHardQualityGateReport(combinedCandidate, absoluteNodes, 'polished').hardClean,
      JSON.stringify(getDisplayHardQualityGateReport(combinedCandidate, absoluteNodes, 'polished'), null, 2),
    ).toBe(true);
    const reclaimedQuality = calculateEdgePathQualityScore(reclaimed);
    const combinedQuality = calculateEdgePathQualityScore(combinedCandidate);
    const reclaimedTrunks = auditFinalSameSideEndpointOrder(reclaimed, absoluteNodes).legalSharedTrunks;
    const combinedTrunks = auditFinalSameSideEndpointOrder(combinedCandidate, absoluteNodes).legalSharedTrunks;
    const terminalSnapshot = createDisplayTerminalValidationSnapshot(absoluteNodes);
    const baselineCustoms = reclaimed.find(item => item.id === 'edge-loms-customs');
    const combinedCustoms = combinedCandidate.find(item => item.id === 'edge-loms-customs');
    const baselineCustomsPath = pathOf(baselineCustoms);
    const combinedCustomsPath = pathOf(combinedCustoms);
    const sourceRect = getDisplayNodeRect(absoluteNodes.find(item => item.id === combinedCustoms?.source)!);
    const targetRect = getDisplayNodeRect(absoluteNodes.find(item => item.id === combinedCustoms?.target)!);
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(absoluteNodes);
    const customsIndex = reclaimed.findIndex(item => item.id === 'edge-loms-customs');
    expect({
      hardDefectsDoNotRegress: combinedQuality.nonOrthogonalSegments <= reclaimedQuality.nonOrthogonalSegments
        && combinedQuality.strictCrossings <= reclaimedQuality.strictCrossings
        && combinedQuality.reverseOverlap <= reclaimedQuality.reverseOverlap
        && combinedQuality.unrelatedOverlap <= reclaimedQuality.unrelatedOverlap
        && combinedQuality.unexplainedRelatedOverlap <= reclaimedQuality.unexplainedRelatedOverlap
        && combinedQuality.shortEndpointStubs <= reclaimedQuality.shortEndpointStubs
        && combinedQuality.tinyInteriorDoglegs <= reclaimedQuality.tinyInteriorDoglegs
        && combinedQuality.hairpins <= reclaimedQuality.hairpins,
      trueTrunksPreserved: reclaimedTrunks.every(trunk => combinedTrunks.some(next => (
        next.nodeId === trunk.nodeId
        && next.role === trunk.role
        && next.side === trunk.side
        && trunk.edgeIds.every(edgeId => next.edgeIds.includes(edgeId))
        && next.commonStemLength + 1e-6 >= 48
      ))),
      obstaclesDoNotRegress: countDisplayObstacleHits(combinedCandidate, absoluteNodes)
        <= countDisplayObstacleHits(reclaimed, absoluteNodes),
      terminalsMatch: JSON.stringify(getDisplayTerminalValidationReport(
        combinedCandidate,
        terminalSnapshot,
      )) === JSON.stringify(getDisplayTerminalValidationReport(reclaimed, terminalSnapshot)),
      declaredAxesValid: Boolean(combinedCustoms && sourceRect && targetRect)
        && !displayTerminalRoleNeedsDeclaredAxisRepair(
          combinedCustoms!, combinedCustomsPath, 'source', sourceRect!,
        )
        && !displayTerminalRoleNeedsDeclaredAxisRepair(
          combinedCustoms!, combinedCustomsPath, 'target', targetRect!,
        ),
      fixedTerminalsPreserved: Boolean(baselineCustoms && combinedCustoms)
        && (!edgeTerminalPositionIsFixed(baselineCustoms!, 'source')
          || JSON.stringify(baselineCustomsPath[0]) === JSON.stringify(combinedCustomsPath[0]))
        && (!edgeTerminalPositionIsFixed(baselineCustoms!, 'target')
          || JSON.stringify(baselineCustomsPath.at(-1)) === JSON.stringify(combinedCustomsPath.at(-1))),
      totalLengthImproves: combinedQuality.totalLength < reclaimedQuality.totalLength,
      detourImproves: combinedQuality.detourPenalty < reclaimedQuality.detourPenalty,
      commercialTrunksPreserved: preservesCommercialTrueTrunkMembership(
        reclaimedTrunks,
        combinedTrunks,
      ),
      changedObstaclesDoNotRegress: changedEdgesObstacleHitsDoNotRegress(
        reclaimed,
        combinedCandidate,
        [customsIndex],
        absoluteNodes,
      ),
      visualHardQualityDoesNotRegress: visualPolishHardQualityDoesNotRegress(
        reclaimedQuality,
        combinedQuality,
      ),
      finalGatePasses: passesBaseReactFlowFinalDisplayGate(
        reclaimed,
        combinedCandidate,
        [customsIndex],
        {},
        evaluation,
      ),
    }).toEqual({
      hardDefectsDoNotRegress: true,
      trueTrunksPreserved: true,
      obstaclesDoNotRegress: true,
      terminalsMatch: true,
      declaredAxesValid: true,
      fixedTerminalsPreserved: true,
      totalLengthImproves: true,
      detourImproves: true,
      commercialTrunksPreserved: true,
      changedObstaclesDoNotRegress: true,
      visualHardQualityDoesNotRegress: true,
      finalGatePasses: true,
    });
    const clearancePrepared = repairDisplayContainerBoundaryClearanceRisks(
      baseline,
      absoluteNodes,
      { maxEdges: 8, maxQualityEvaluations: 32 },
    );
    const repaired = repairBaseReactFlowFinalCommercialDetours(clearancePrepared, absoluteNodes, {
      skipLoopShortcut: true,
    });
    const repairedReport = getDisplayHardQualityGateReport(repaired, absoluteNodes, 'polished');
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const repairedCustomsPath = pathOf(repaired.find(item => item.id === 'edge-loms-customs'));
    const candidateCustomsPath = pathOf(candidate.find(item => item.id === 'edge-loms-customs'));
    const repairedDiagnostics = JSON.stringify({ repairedReport, repairedQuality, repaired }, null, 2);
    expect(repairedReport.hardClean, repairedDiagnostics).toBe(true);
    expect(repairedQuality.totalLength, repairedDiagnostics)
      .toBeLessThanOrEqual(candidateQuality.totalLength);
    expect(repairedCustomsPath.length, repairedDiagnostics)
      .toBeLessThanOrEqual(candidateCustomsPath.length);
  });

  it('reroutes a post-trunk child branch around a deep business-node obstacle', () => {
    const nodes = [
      node('hub', 0, 0, 80, 60),
      node('blocker', 220, 70, 80, 60),
      node('upper-target', 400, 70, 80, 60),
      node('lower-target', 400, 170, 80, 60),
    ];
    const edges: Edge[] = [
      {
        id: 'upper-branch',
        source: 'hub',
        target: 'upper-target',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { computedPath: [
          { x: 80, y: 30 },
          { x: 140, y: 30 },
          { x: 140, y: 100 },
          { x: 400, y: 100 },
        ] },
      },
      {
        id: 'lower-branch',
        source: 'hub',
        target: 'lower-target',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { computedPath: [
          { x: 80, y: 30 },
          { x: 140, y: 30 },
          { x: 140, y: 200 },
          { x: 400, y: 200 },
        ] },
      },
    ];
    const baselineTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
    expect(getDisplayHardQualityGateReport(edges, nodes, 'polished').obstacleHits).toBeGreaterThan(0);
    expect(baselineTrunks.some(trunk => (
      trunk.role === 'source'
      && trunk.nodeId === 'hub'
      && trunk.edgeIds.length === 2
    ))).toBe(true);

    const repaired = repairBaseReactFlowFinalEndpointOrder(edges, nodes);
    const repairedReport = getDisplayHardQualityGateReport(repaired, nodes, 'polished');
    const repairedTrunks = auditFinalSameSideEndpointOrder(repaired, nodes).legalSharedTrunks;

    expect(repairedReport.obstacleHits).toBe(0);
    expect(pathOf(repaired.find(item => item.id === 'upper-branch'))).not.toEqual(pathOf(edges[0]));
    expect(repairedTrunks.some(trunk => (
      trunk.role === 'source'
      && trunk.nodeId === 'hub'
      && trunk.edgeIds.includes('upper-branch')
      && trunk.edgeIds.includes('lower-branch')
    ))).toBe(true);
  });

  it('hard-gates both one-pixel Logistics residual crossings and honors the mutable closure', () => {
    const nodes = [
      node('l-oms', 935.25, 534, 259, 118),
      node('customs', 1_525.75, 823, 282, 96),
      node('tms', 923.75, 812, 282, 118),
      node('carrier-portal', 1_320.1125, 84, 211, 118),
      node('bms', 650, 1_090, 243, 118),
      node('visibility', 1_286.3375, 1_540, 296, 118),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-loms-customs',
        source: 'l-oms',
        target: 'customs',
        sourceHandle: 'bottom',
        targetHandle: 'left',
        data: { computedPath: [
          { x: 1_176, y: 652 },
          { x: 1_176, y: 787 },
          { x: 1_245.75, y: 787 },
          { x: 1_245.75, y: 867 },
          { x: 1_525.75, y: 867 },
        ] },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier-portal',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1_177, y: 811 },
          { x: 1_177, y: 763 },
          { x: 1_426, y: 763 },
          { x: 1_426, y: 203 },
        ] },
      },
      {
        id: 'edge-loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 1_065, y: 653 },
          { x: 1_065, y: 751 },
          { x: 1_041, y: 751 },
          { x: 1_041, y: 803 },
          { x: 811, y: 803 },
          { x: 811, y: 1_044 },
          { x: 933, y: 1_044 },
          { x: 933, y: 1_392 },
          { x: 1_435, y: 1_392 },
          { x: 1_435, y: 1_539 },
        ] },
      },
      {
        id: 'edge-tms-bms',
        source: 'tms',
        target: 'bms',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 1_065, y: 931 },
          { x: 1_065, y: 1_020 },
          { x: 812, y: 1_020 },
          { x: 812, y: 1_089 },
        ] },
      },
    ];
    const strictCrossingPairs = (candidates: Edge[]) => findDisplayStrictCrossingHits(candidates)
      .map(hit => [candidates[hit.a.edgeIndex]?.id, candidates[hit.b.edgeIndex]?.id]
        .filter((id): id is string => Boolean(id))
        .sort()
        .join('|'))
      .sort();

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(2);
    expect(strictCrossingPairs(edges)).toEqual([
      'edge-loms-customs|edge-tms-carrier',
      'edge-loms-visibility|edge-tms-bms',
    ]);

    const result = repairBaseReactFlowFinalEndpointOrder(edges, nodes);
    const changedEdgeIds = result.flatMap((candidate, index) => (
      candidate !== edges[index] ? [candidate.id] : []
    ));
    const eligibleEdgeIds = new Set(edges.map(candidate => candidate.id));
    eligibleEdgeIds.delete(changedEdgeIds[0]);
    const blocked = repairBaseReactFlowFinalEndpointOrder(edges, nodes, { eligibleEdgeIds });

    expect(changedEdgeIds.length).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(result).strictCrossings).toBe(0);
    expect(strictCrossingPairs(result)).toEqual([]);
    const report = getDisplayHardQualityGateReport(result, nodes, 'polished');
    expect(report.hardClean, JSON.stringify({ report, paths: result.map(item => ({
      id: item.id,
      path: pathOf(item),
    })) }, null, 2)).toBe(true);
    const blockedChangedIds = blocked.flatMap((candidate, index) => (
      candidate !== edges[index] ? [candidate.id] : []
    ));
    expect(blockedChangedIds.every(id => eligibleEdgeIds.has(id))).toBe(true);
    expect(blocked.find(candidate => candidate.id === changedEdgeIds[0]))
      .toBe(edges.find(candidate => candidate.id === changedEdgeIds[0]));
    if (blocked !== edges) {
      expect(getDisplayHardQualityGateReport(blocked, nodes, 'polished').hardClean).toBe(true);
    }
  });

  it('commits a true source trunk only after the exact display hard gate is clean', () => {
    const { nodes, edges } = fixture();
    const repairNodes = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(item => [item.id, item] as const)),
    );

    const result = repairBaseReactFlowFinalEndpointOrder(edges, nodes);

    expect(auditFinalSameSideEndpointOrder(edges, repairNodes).inversions).toBe(1);
    expect(auditFinalSameSideEndpointOrder(result, repairNodes).inversions).toBe(0);
    expect(result.map(item => pathOf(item)[0]?.x)).toEqual([150, 150]);
    expect(auditFinalSameSideEndpointOrder(result, repairNodes).legalSharedTrunks).toEqual([
      expect.objectContaining({
        nodeId: 'hub',
        role: 'source',
        edgeIds: ['left-edge', 'right-edge'],
        commonStemLength: 60,
      }),
    ]);
    const report = getDisplayHardQualityGateReport(result, repairNodes, 'polished');
    expect(report.hardClean, JSON.stringify(report, null, 2)).toBe(true);
    expect(repairBaseReactFlowFinalEndpointOrder(result, nodes)).toBe(result);
  });

  it('does not mutate edges outside an incremental mutable closure', () => {
    const { nodes, edges } = fixture();

    const result = repairBaseReactFlowFinalEndpointOrder(edges, nodes, {
      eligibleEdgeIds: new Set(['left-edge']),
    });

    expect(result).toBe(edges);
  });

  it('consolidates compatible parallel child lanes into one true source trunk', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('near', 600, 400, 100, 80),
      node('far', 1_200, 400, 100, 80),
    ];
    const edges: Edge[] = [
      {
        ...edge('near-edge', 'near', [
          { x: 156, y: 100 },
          { x: 156, y: 200 },
          { x: 650, y: 200 },
          { x: 650, y: 400 },
        ]),
        data: {
          sharedTrunkAware: true,
          computedPath: [
            { x: 156, y: 100 },
            { x: 156, y: 200 },
            { x: 650, y: 200 },
            { x: 650, y: 400 },
          ],
        },
      },
      {
        ...edge('far-edge', 'far', [
          { x: 168, y: 100 },
          { x: 168, y: 200 },
          { x: 1_250, y: 200 },
          { x: 1_250, y: 400 },
        ]),
        data: {
          sharedTrunkAware: true,
          computedPath: [
            { x: 168, y: 100 },
            { x: 168, y: 200 },
            { x: 1_250, y: 200 },
            { x: 1_250, y: 400 },
          ],
        },
      },
    ];
    const repairNodes = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(item => [item.id, item] as const)),
    );

    const result = repairBaseReactFlowFinalEndpointOrder(edges, nodes);
    const passage = auditFinalSameSidePassageOrder(result, repairNodes);
    const endpointOrder = auditFinalSameSideEndpointOrder(result, repairNodes);

    expect(auditFinalSameSidePassageOrder(edges, repairNodes).parallelChildOverlaps).toBe(1);
    expect(passage.parallelChildOverlaps).toBe(0);
    expect(result.map(item => pathOf(item)[0]?.x)).toEqual([162, 162]);
    expect(pathOf(result[0])[1]?.y).toBe(pathOf(result[1])[1]?.y);
    expect(endpointOrder.legalSharedTrunks).toEqual([
      expect.objectContaining({
        nodeId: 'hub',
        role: 'source',
        edgeIds: ['far-edge', 'near-edge'],
        commonStemLength: 100,
      }),
    ]);
    const report = getDisplayHardQualityGateReport(result, repairNodes, 'polished');
    expect(report.hardClean, JSON.stringify(report, null, 2)).toBe(true);
  });

  it('resolves an unsafe same-side swap through a hard-gated passage or side escape', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('fixed', 70, 400, 60, 60),
      node('middle', 520, 400, 60, 60),
      node('far', 920, 400, 60, 60),
    ];
    const edges: Edge[] = [
      edge('fixed-edge', 'fixed', [
        { x: 100, y: 100 },
        { x: 100, y: 400 },
      ]),
      edge('middle-edge', 'middle', [
        { x: 220, y: 100 },
        { x: 220, y: 200 },
        { x: 550, y: 200 },
        { x: 550, y: 400 },
      ]),
      edge('far-edge', 'far', [
        { x: 180, y: 100 },
        { x: 180, y: 220 },
        { x: 950, y: 220 },
        { x: 950, y: 400 },
      ]),
    ];
    const repairNodes = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(item => [item.id, item] as const)),
    );

    const result = repairBaseReactFlowFinalEndpointOrder(edges, nodes);
    const sourceGroups = auditFinalSameSideEndpointOrder(result, repairNodes).groups
      .filter(group => group.nodeId === 'hub' && group.role === 'source');

    expect(auditFinalSameSideEndpointOrder(edges, repairNodes).inversions).toBe(1);
    expect(sourceGroups.every(group => group.inversions === 0)).toBe(true);
    expect(sourceGroups.every(group => group.collapsedLanePairs === 0)).toBe(true);
    expect(auditFinalSameSidePassageOrder(result, repairNodes).passageDefects).toBe(0);
    expect(getDisplayHardQualityGateReport(result, repairNodes, 'polished').hardClean).toBe(true);
  });

  it('aligns nearby automatic target stems without changing their source terminals', () => {
    const nodes = [
      node('first', 0, 0, 60, 60),
      node('second', 200, 0, 60, 60),
      node('third', 400, 0, 60, 60),
      node('sink', 800, 500, 300, 100),
    ];
    const targetEdge = (
      id: string,
      source: string,
      sourceX: number,
      targetX: number,
      laneY: number,
    ): Edge => ({
      id,
      source,
      target: 'sink',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      type: 'advanced-smart-step',
      data: {
        computedPath: [
          { x: sourceX, y: 60 },
          { x: sourceX, y: laneY },
          { x: targetX, y: laneY },
          { x: targetX, y: 500 },
        ],
      },
    });
    const edges = [
      targetEdge('first-edge', 'first', 30, 850, 380),
      targetEdge('second-edge', 'second', 230, 900, 320),
      targetEdge('third-edge', 'third', 430, 930, 260),
    ];
    const repairNodes = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(item => [item.id, item] as const)),
    );
    const sourceTerminals = edges.map(candidate => pathOf(candidate)[0]);

    const result = repairBaseReactFlowFinalEndpointOrder(edges, nodes);
    const order = auditFinalSameSideEndpointOrder(result, repairNodes);
    const targetTrunk = order.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink'
      && trunk.role === 'target'
      && trunk.edgeIds.length === 3
    ));

    expect(result.map(candidate => pathOf(candidate)[0])).toEqual(sourceTerminals);
    expect(targetTrunk?.commonStemLength).toBeGreaterThanOrEqual(48);
    expect(order.inversions).toBe(0);
    expect(order.collapsedLanePairs).toBe(0);
    expect(getDisplayHardQualityGateReport(result, repairNodes, 'polished').hardClean).toBe(true);
  });

  it('skips the residual overlap closure when the exact baseline is already hard-clean', () => {
    const nodes = [
      node('source', 0, 0, 100, 100),
      node('target', 0, 300, 100, 100),
    ];
    const repairNodes = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(item => [item.id, item] as const)),
    );
    const edges: Edge[] = [{
      id: 'clean-edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { computedPath: [{ x: 50, y: 100 }, { x: 50, y: 300 }] },
    }];
    const report = getDisplayHardQualityGateReport(edges, repairNodes, 'polished');

    const result = repairBaseReactFlowResidualOverlapAxisClosure(
      edges,
      repairNodes,
      report,
    );

    expect(report.hardClean).toBe(true);
    expect(result.edges).toBe(edges);
    expect(result.report).toBe(report);
  });

  it('preserves the commercial source-stem floor during clearance repair', () => {
    const nodes: Node[] = [
      node('hub', 0, 0, 100, 100),
      node('blocker', 0, 250, 100, 100),
      node('first-target', 150, 300, 100, 100),
      node('second-target', 500, 350, 100, 100),
    ];
    const edges: Edge[] = [
      {
        id: 'first', source: 'hub', target: 'first-target',
        sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [
          { x: 50, y: 100 }, { x: 50, y: 170 },
          { x: 200, y: 170 }, { x: 200, y: 300 },
        ] },
      },
      {
        id: 'second', source: 'hub', target: 'second-target',
        sourceHandle: 'bottom', targetHandle: 'left',
        data: { computedPath: [
          { x: 50, y: 100 }, { x: 50, y: 170 },
          { x: -120, y: 170 }, { x: -120, y: 400 }, { x: 500, y: 400 },
        ] },
      },
      {
        id: 'blocker-branch', source: 'hub', target: 'blocker',
        sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 50, y: 100 }, { x: 50, y: 250 }] },
      },
    ];

    const repaired = repairBaseReactFlowFinalCommercialDetours(
      edges,
      nodes,
      { skipLoopShortcut: true },
    );
    const sourceTrunk = auditFinalSameSideEndpointOrder(repaired, nodes).legalSharedTrunks
      .find(trunk => trunk.nodeId === 'hub' && trunk.edgeIds.length === 3);

    expect(repaired).not.toBe(edges);
    expect(repaired.every(candidate => scoreNodeClearanceRisk(
      (candidate.data?.computedPath ?? []) as Point[],
      nodes,
      candidate,
      48,
    ) === 0)).toBe(true);
    expect(sourceTrunk?.commonStemLength).toBeGreaterThanOrEqual(48);
    expect(sourceTrunk?.commonStemLength).toBeLessThanOrEqual(70);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });
});
