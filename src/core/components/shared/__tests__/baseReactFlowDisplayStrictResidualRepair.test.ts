// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import tmsStandardData from '../../../../data/standardized/TmsStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import {
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  type DisplaySegment,
} from '../baseReactFlowDisplayGeometry';
import { blockerEscapeLanesForCrossedSpine } from '../baseReactFlowDisplayCrossedSpineSkirtGeometry';
import {
  buildCrossedSpineInternalLaneCandidates,
  buildCrossedSpineLocalWallCandidates,
} from '../baseReactFlowDisplayCrossedSpineSkirtCandidates';
import { buildSharedTargetOuterBridgeCandidates } from '../baseReactFlowDisplaySharedTargetOuterBridge';
import {
  createStrictCrossingRepairDiagnostics,
  repairFinalResidualStrictCrossings,
  repairInternalStrictCrossingLanes,
} from '../baseReactFlowDisplayStrictResidualRepair';
import { buildNodeBoundaryAdjacentLaneCandidates } from '../baseReactFlowDisplayNodeBoundaryLaneCandidates';
import { buildStrictEndpointDetourCandidates } from '../baseReactFlowDisplayStrictEndpointDetourCandidates';
import {
  repairCrossedSpineWithOuterSkirt,
  type CrossedSpineSkirtRepairReport,
} from '../baseReactFlowDisplayCrossedSpineSkirtRepair';
import {
  edgeNodeObstacleHits,
  withAbsoluteNodePositions,
} from './baseReactFlowDisplayEdges.testUtils';
import {
  tmsCrossedCostSpinePaths,
  tmsResidualStrictPaths,
} from './fixtures/tmsResidualStrictPaths';
import {
  createDisplayTerminalValidationSnapshot,
  displayEdgesHaveNodeAnchoredTerminals,
} from '../baseReactFlowTerminalAxisRepair';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  type: 'process',
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

describe('final residual strict-crossing repair', () => {
  it('does not construct node-aware repair contexts without a strict-crossing defect', () => {
    const cleanEdges: Edge[] = [{
      id: 'clean-edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 120, y: 0 }] },
    }];
    const unreadableNodes = new Proxy([] as Node[], {
      get: () => {
        throw new Error('node context must remain lazy');
      },
    });
    const internalDiagnostics = createStrictCrossingRepairDiagnostics();
    const finalDiagnostics = createStrictCrossingRepairDiagnostics();

    expect(repairInternalStrictCrossingLanes(
      cleanEdges,
      unreadableNodes,
      internalDiagnostics,
    )).toBe(cleanEdges);
    expect(repairFinalResidualStrictCrossings(
      cleanEdges,
      unreadableNodes,
      finalDiagnostics,
    )).toBe(cleanEdges);
    expect(internalDiagnostics).toEqual({ qualityEvaluationCount: 0, nodeContextBuildCount: 0 });
    expect(finalDiagnostics).toEqual({ qualityEvaluationCount: 0, nodeContextBuildCount: 0 });
  });

  it('skirts a crossed fan-in bundle outside its aggregate boundary', () => {
    const horizontalSpine: DisplaySegment = {
      edgeIndex: 2,
      segmentIndex: 2,
      axis: 'h',
      direction: -1,
      a: { x: 5312, y: 602 },
      b: { x: 2475, y: 602 },
    };
    const targetTrunks: DisplaySegment[] = [
      {
        edgeIndex: 0,
        segmentIndex: 3,
        axis: 'v',
        direction: -1,
        a: { x: 4821, y: 614 },
        b: { x: 4821, y: 496 },
      },
      {
        edgeIndex: 1,
        segmentIndex: 3,
        axis: 'v',
        direction: -1,
        a: { x: 4821, y: 626 },
        b: { x: 4821, y: 496 },
      },
    ];

    expect(blockerEscapeLanesForCrossedSpine(horizontalSpine, targetTrunks))
      .toEqual([472, 650, 440, 682]);
  });

  it('preserves both terminal trunks while moving a reverse lane outside a fan-in wall', () => {
    const edges: Edge[] = [
      {
        id: 'inventory-bi', source: 'inventory', target: 'bi',
        sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [
          { x: 2386, y: 235 }, { x: 2463, y: 235 },
          { x: 2463, y: 614 }, { x: 4821, y: 614 },
          { x: 4821, y: 496 }, { x: 4911, y: 496 },
        ] },
      },
      {
        id: 'receipt-bi', source: 'receipt', target: 'bi',
        sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [
          { x: 1327, y: 506 }, { x: 1417, y: 506 },
          { x: 1417, y: 626 }, { x: 4821, y: 626 },
          { x: 4821, y: 496 }, { x: 4911, y: 496 },
        ] },
      },
      {
        id: 'so-inventory', source: 'so', target: 'inventory',
        sourceHandle: 'left', targetHandle: 'right',
        data: { computedPath: [
          { x: 5401, y: 506 }, { x: 5312, y: 506 },
          { x: 5312, y: 602 }, { x: 2475, y: 602 },
          { x: 2475, y: 217 }, { x: 2386, y: 217 },
        ] },
      },
    ];
    const segments = extractDisplaySegments(edges);
    const spine = segments.find(segment => (
      segment.edgeIndex === 2 && segment.segmentIndex === 2
    ));
    expect(spine).toBeDefined();
    if (!spine) throw new Error('Expected the reverse-flow internal spine');

    const candidates = buildCrossedSpineInternalLaneCandidates(
      edges[2],
      2,
      spine,
      [],
      segments.filter(segment => segment.edgeIndex !== 2),
    );
    const safe = candidates.find(candidate => candidate.strictCrossings === 0);
    expect(safe).toBeDefined();
    if (!safe) throw new Error('Expected a hard-safe aggregate skirt candidate');

    expect(safe.edge.sourceHandle).toBe('left');
    expect(safe.edge.targetHandle).toBe('right');
    expect(getDisplayComputedPath(safe.edge)).toEqual([
      { x: 5401, y: 506 }, { x: 5312, y: 506 },
      { x: 5312, y: 472 }, { x: 2475, y: 472 },
      { x: 2475, y: 217 }, { x: 2386, y: 217 },
    ]);
  });

  it('locally skirts a crossed target-trunk wall without moving either terminal trunk', () => {
    const edges: Edge[] = [
      {
        id: 'inventory-bi', source: 'inventory', target: 'bi',
        data: { computedPath: [
          { x: 2386, y: 235 }, { x: 2463, y: 235 },
          { x: 2463, y: 614 }, { x: 4821, y: 614 },
          { x: 4821, y: 496 }, { x: 4911, y: 496 },
        ] },
      },
      {
        id: 'receipt-bi', source: 'receipt', target: 'bi',
        data: { computedPath: [
          { x: 1327, y: 506 }, { x: 1417, y: 506 },
          { x: 1417, y: 626 }, { x: 4821, y: 626 },
          { x: 4821, y: 496 }, { x: 4911, y: 496 },
        ] },
      },
      {
        id: 'so-inventory', source: 'so', target: 'inventory',
        sourceHandle: 'left', targetHandle: 'right',
        data: { computedPath: [
          { x: 5401, y: 506 }, { x: 5312, y: 506 },
          { x: 5312, y: 602 }, { x: 2475, y: 602 },
          { x: 2475, y: 217 }, { x: 2386, y: 217 },
        ] },
      },
    ];
    const segments = extractDisplaySegments(edges);
    const spine = segments.find(segment => (
      segment.edgeIndex === 2 && segment.segmentIndex === 2
    ));
    expect(spine).toBeDefined();
    if (!spine) throw new Error('Expected the reverse-flow internal spine');

    const candidates = buildCrossedSpineLocalWallCandidates(
      edges[2],
      2,
      spine,
      [],
      segments.filter(segment => segment.edgeIndex !== 2),
    );
    const safe = candidates.find(candidate => candidate.strictCrossings === 0);
    expect(safe).toBeDefined();
    if (!safe) throw new Error('Expected a hard-safe local wall skirt candidate');

    expect(safe.edge.sourceHandle).toBe('left');
    expect(safe.edge.targetHandle).toBe('right');
    expect(getDisplayComputedPath(safe.edge)).toEqual([
      { x: 5401, y: 506 }, { x: 5312, y: 506 },
      { x: 5312, y: 602 }, { x: 4967, y: 602 },
      { x: 4967, y: 472 }, { x: 4765, y: 472 },
      { x: 4765, y: 602 }, { x: 2475, y: 602 },
      { x: 2475, y: 217 }, { x: 2386, y: 217 },
    ]);
  });

  it('moves a WMS return barrier to a safe target side instead of crossing its outgoing branch', () => {
    const nodes: Node[] = [
      node('allocation', 1079.8, 1417.5, 206, 96),
      node('wave-planning', 1605.8, 1895, 206, 73),
      node('labor-schedule-feedback', 6144.85, 1552, 202, 60),
    ];
    const edges: Edge[] = [
      {
        id: 'e-wave-plan',
        source: 'allocation',
        target: 'wave-planning',
        sourceHandle: 'bottom',
        targetHandle: 'left',
        data: { computedPath: [
          { x: 1286, y: 1514 }, { x: 1286, y: 1586 },
          { x: 1334, y: 1586 }, { x: 1334, y: 1932 }, { x: 1606, y: 1932 },
        ] },
      },
      {
        id: 'e-labor-alloc-fb',
        source: 'labor-schedule-feedback',
        target: 'allocation',
        sourceHandle: 'bottom',
        targetHandle: 'right',
        data: { computedPath: [
          { x: 6145, y: 1612 }, { x: 6145, y: 2081 },
          { x: 1350, y: 2081 }, { x: 1350, y: 1498 }, { x: 1285.8, y: 1498 },
        ] },
      },
    ];
    let report: CrossedSpineSkirtRepairReport | undefined;
    const repaired = repairCrossedSpineWithOuterSkirt(edges, nodes, {
      onReport: next => { report = next; },
    });
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.strictCrossings, JSON.stringify({ report, repaired }, null, 2)).toBe(0);
    expect(quality.reverseOverlap).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.unexplainedRelatedOverlap).toBe(0);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
  });

  it('does not trade edge-tms-cost terminal roles for an internal strict-lane improvement', () => {
    const edges: Edge[] = [
      {
        id: 'edge-tms-cost',
        source: 'tms-planning',
        target: 'cost-analysis',
        sourceHandle: 'right',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 1437, y: 1827 },
          { x: 1485, y: 1827 },
          { x: 1485, y: 1943 },
          { x: 1682, y: 1943 },
          { x: 1682, y: 2751 },
        ] },
      },
      {
        id: 'wide-horizontal-blocker',
        source: 'blocker-source',
        target: 'blocker-target',
        data: { computedPath: [
          { x: 1400, y: 900 },
          { x: 1400, y: 1900 },
          { x: 1531, y: 1900 },
        ] },
      },
      {
        id: 'left-entry-blocker',
        source: 'left-source',
        target: 'left-target',
        data: { computedPath: [
          { x: 1410, y: 1800 },
          { x: 1410, y: 1850 },
        ] },
      },
      {
        id: 'right-entry-blocker',
        source: 'right-source',
        target: 'right-target',
        data: { computedPath: [
          { x: 1520, y: 1800 },
          { x: 1520, y: 1850 },
        ] },
      },
    ];
    const nodes = [
      node('tms-planning', 1337, 1779, 100, 96),
      node('cost-analysis', 1626, 2751, 112, 96),
    ];
    const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
    const baselineTerminals = terminalValidation.validateEdge(edges[0]);
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const temptingDetachedCost: Edge = {
      ...edges[0],
      data: {
        ...edges[0].data,
        computedPath: [
          { x: 1437, y: 1912 },
          { x: 1543, y: 1912 },
          { x: 1543, y: 1943 },
          { x: 1682, y: 1943 },
          { x: 1682, y: 2751 },
        ],
      },
    };

    expect(baselineQuality.strictCrossings).toBe(1);
    expect(baselineTerminals).toEqual({
      attached: true,
      anchored: true,
      sourceAttached: true,
      sourceAnchored: true,
      targetAttached: true,
      targetAnchored: true,
    });
    expect(calculateEdgePathQualityScore([temptingDetachedCost, ...edges.slice(1)]).strictCrossings)
      .toBe(0);
    expect(terminalValidation.validateEdge(temptingDetachedCost)).toEqual({
      attached: false,
      anchored: false,
      sourceAttached: false,
      sourceAnchored: false,
      targetAttached: true,
      targetAnchored: true,
    });

    const repaired = repairInternalStrictCrossingLanes(edges, nodes);
    const repairedCost = repaired.find(edge => edge.id === 'edge-tms-cost');

    if (!repairedCost) throw new Error('Expected edge-tms-cost to remain in the repaired edge set.');
    expect(calculateEdgePathQualityScore(repaired).strictCrossings)
      .toBeLessThanOrEqual(baselineQuality.strictCrossings);
    expect(terminalValidation.validateEdge(repairedCost)).toEqual(baselineTerminals);
  });

  it('repairs a crossing one pixel inside an internal bend without detaching terminals', () => {
    const edges: Edge[] = [
      {
        id: 'mover',
        source: 'mover-source',
        target: 'mover-target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 50, y: 50 },
          { x: 50, y: 100 },
          { x: 150, y: 100 },
          { x: 150, y: 300 },
        ] },
      },
      {
        id: 'near-bend-blocker',
        source: 'blocker-source',
        target: 'blocker-target',
        data: { computedPath: [
          { x: 51, y: 75 },
          { x: 51, y: 150 },
        ] },
      },
    ];
    const nodes = [
      node('mover-source', 0, 0, 100, 50),
      node('mover-target', 100, 300, 100, 50),
    ];

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    expect(displayEdgesHaveNodeAnchoredTerminals(edges.slice(0, 1), nodes)).toBe(true);

    const repaired = repairFinalResidualStrictCrossings(edges, nodes);
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(repairedQuality.strictCrossings).toBe(0);
    expect(repairedQuality.nonOrthogonalSegments).toBe(0);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(displayEdgesHaveNodeAnchoredTerminals(repaired.slice(0, 1), nodes)).toBe(true);
  });

  it('keeps changed terminals anchored while moving an internal crossing lane', () => {
    const edges: Edge[] = [
      {
        id: 'delivery-to-mobile',
        source: 'delivery',
        target: 'mobile',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1438, y: 2313 },
          { x: 1438, y: 2243 },
          { x: 1768, y: 2243 },
          { x: 1768, y: 253 },
          { x: 1706, y: 253 },
          { x: 1706, y: 181 },
        ] },
      },
      {
        id: 'execution-to-portal',
        source: 'execution',
        target: 'portal',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1486, y: 1985 },
          { x: 1486, y: 1937 },
          { x: 1789, y: 1937 },
          { x: 1789, y: 52 },
          { x: 1414, y: 52 },
          { x: 1414, y: 514 },
          { x: 1631, y: 514 },
          { x: 1631, y: 374 },
          { x: 1250, y: 374 },
          { x: 1250, y: 181 },
        ] },
      },
      {
        id: 'unrelated-horizontal-blocker',
        source: 'frp',
        target: 'blocker-target',
        sourceHandle: 'left',
        data: { computedPath: [
          { x: 1555, y: 571 },
          { x: 1627, y: 571 },
        ] },
      },
    ];
    const nodes = [
      node('delivery', 1357.82, 2313, 160, 96),
      node('mobile', 1646.2, 85, 120, 96),
      node('execution', 1360.62, 1985, 152, 96),
      node('portal', 1174.2, 85, 152, 96),
      node('frp', 1627.8, 523, 128, 96),
    ];

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    expect(displayEdgesHaveNodeAnchoredTerminals(edges.slice(0, 2), nodes)).toBe(true);

    const repaired = repairFinalResidualStrictCrossings(edges, nodes);

    const repairedQuality = calculateEdgePathQualityScore(repaired);
    expect(repairedQuality.nonOrthogonalSegments).toBe(0);
    expect(repairedQuality.strictCrossings).toBe(0);
    expect(repairedQuality.reverseOverlap).toBe(0);
    expect(repairedQuality.unrelatedOverlap).toBe(0);
    expect(repairedQuality.unexplainedRelatedOverlap).toBe(0);
    expect(repairedQuality.shortEndpointStubs).toBe(0);
    expect(repairedQuality.tinyInteriorDoglegs).toBe(0);
    expect(repairedQuality.hairpins).toBe(0);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(displayEdgesHaveNodeAnchoredTerminals(repaired.slice(0, 2), nodes)).toBe(true);
  });

  it('offers a bounded node-boundary corridor for an adjacent crossing lane', () => {
    const carrierPath = [
      { x: 1486, y: 1985 },
      { x: 1486, y: 1937 },
      { x: 1789, y: 1937 },
      { x: 1789, y: 52 },
      { x: 1414, y: 52 },
      { x: 1414, y: 514 },
      { x: 1631, y: 514 },
      { x: 1631, y: 374 },
      { x: 1250, y: 374 },
      { x: 1250, y: 181 },
    ];
    const candidates = buildNodeBoundaryAdjacentLaneCandidates(
      carrierPath,
      1,
      'h',
      [node('mobile', 1646.2, 85, 120, 96)],
      1768,
      [],
    );
    const corridorCandidate = candidates.find(candidate => candidate.some((point, index) => {
      const next = candidate[index + 1];
      return next
        && Math.abs(point.x - next.x) <= 1
        && Math.min(point.y, next.y) < 571
        && Math.max(point.y, next.y) > 571
        && point.x > 1627
        && point.x < 1646.2;
    }));

    expect(candidates.length).toBeLessThanOrEqual(20);
    expect(corridorCandidate).toBeDefined();
  });

  it('builds a bounded local detour past the end of a crossing segment', () => {
    const mobilePath = [
      { x: 1438, y: 2313 },
      { x: 1438, y: 2243 },
      { x: 1768, y: 2243 },
      { x: 1768, y: 253 },
      { x: 1706, y: 253 },
      { x: 1706, y: 181 },
    ];
    const candidates = buildStrictEndpointDetourCandidates(
      mobilePath,
      {
        edgeIndex: 0,
        segmentIndex: 2,
        axis: 'v',
        direction: -1,
        a: mobilePath[2],
        b: mobilePath[3],
      },
      {
        edgeIndex: 1,
        segmentIndex: 1,
        axis: 'h',
        direction: 1,
        a: { x: 1486, y: 1937 },
        b: { x: 1789, y: 1937 },
      },
    );

    expect(candidates.length).toBeLessThanOrEqual(4);
    expect(candidates).toContainEqual([
      { x: 1438, y: 2313 },
      { x: 1438, y: 2243 },
      { x: 1813, y: 2243 },
      { x: 1813, y: 1961 },
      { x: 1768, y: 1961 },
      { x: 1768, y: 253 },
      { x: 1706, y: 253 },
      { x: 1706, y: 181 },
    ]);
  });

  it('repairs the complete TMS residual snapshot transactionally', async () => {
    const canvas = await standardDataToCanvas(tmsStandardData as any);
    const nodes = withAbsoluteNodePositions(canvas.nodes as any);
    const edges = canvas.edges
      .filter(edge => tmsResidualStrictPaths[edge.id])
      .map(edge => ({
        ...edge,
        data: {
          ...(edge.data as any),
          computedPath: tmsResidualStrictPaths[edge.id].map(point => ({ ...point })),
        },
      }));
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const repaired = repairFinalResidualStrictCrossings(edges, nodes);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    expect(baselineQuality.strictCrossings).toBe(2);
    expect({
      nonOrthogonalSegments: repairedQuality.nonOrthogonalSegments,
      strictCrossings: repairedQuality.strictCrossings,
      reverseOverlap: repairedQuality.reverseOverlap,
      unrelatedOverlap: repairedQuality.unrelatedOverlap,
      unexplainedRelatedOverlap: repairedQuality.unexplainedRelatedOverlap,
      shortEndpointStubs: repairedQuality.shortEndpointStubs,
      tinyInteriorDoglegs: repairedQuality.tinyInteriorDoglegs,
      hairpins: repairedQuality.hairpins,
      obstacleHits: countDisplayObstacleHits(repaired, nodes),
    }).toEqual({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      obstacleHits: 0,
    });
  }, 120_000);

  it('can place the stepped TMS cost spine outside both reverse terminal approaches', async () => {
    const canvas = await standardDataToCanvas(tmsStandardData as any);
    const nodes = withAbsoluteNodePositions(canvas.nodes as any);
    const paths: Record<string, Array<{ x: number; y: number }>> = {
      'edge-gps-tms-execution': [
        { x: 1307.8, y: 571 },
        { x: 1572.62, y: 571 },
        { x: 1572.62, y: 2034 },
        { x: 1512.62, y: 2034 },
      ],
      'edge-tms-mobile': [
        { x: 1438, y: 2314 },
        { x: 1438, y: 2193 },
        { x: 1523, y: 2193 },
        { x: 1523, y: 2092 },
        { x: 1795.8, y: 2092 },
        { x: 1795.8, y: 253 },
        { x: 1706, y: 253 },
        { x: 1706, y: 180 },
      ],
      'edge-tms-cost': [
        { x: 1500.62, y: 1826 },
        { x: 1500.62, y: 1922 },
        { x: 1537, y: 1922 },
        { x: 1537, y: 2752 },
        { x: 1625.8, y: 2752 },
      ],
    };
    const handles: Record<string, { source: string; target: string }> = {
      'edge-gps-tms-execution': { source: 'right', target: 'right' },
      'edge-tms-mobile': { source: 'top', target: 'bottom' },
      'edge-tms-cost': { source: 'bottom', target: 'left' },
    };
    const edges = canvas.edges
      .filter(edge => paths[edge.id])
      .map(edge => ({
        ...edge,
        sourceHandle: handles[edge.id].source,
        targetHandle: handles[edge.id].target,
        data: { ...edge.data, computedPath: paths[edge.id] },
      }));
    const candidate = repairCrossedSpineWithOuterSkirt(edges, nodes);

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(2);
    expect(calculateEdgePathQualityScore(candidate).strictCrossings).toBe(0);
    expect(displayEdgesHaveNodeAnchoredTerminals(candidate, nodes)).toBe(true);
    expect(
      countDisplayObstacleHits(candidate, nodes),
      JSON.stringify(edgeNodeObstacleHits(candidate, nodes), null, 2),
    ).toBe(0);
  });

  it('repairs the cold TMS crossed-cost snapshot without trading it for another hard defect', async () => {
    const canvas = await standardDataToCanvas(tmsStandardData as any);
    const nodes = withAbsoluteNodePositions(canvas.nodes as any);
    const edges = canvas.edges
      .filter(edge => tmsCrossedCostSpinePaths[edge.id])
      .map(edge => ({
        ...edge,
        ...(edge.id === 'edge-tms-cost'
          ? { sourceHandle: 'bottom', targetHandle: 'left' }
          : {}),
        data: {
          ...edge.data,
          computedPath: tmsCrossedCostSpinePaths[edge.id].map(point => ({ ...point })),
        },
      }));
    let report: CrossedSpineSkirtRepairReport | undefined;
    const skirtRepaired = repairCrossedSpineWithOuterSkirt(edges, nodes, {
      onReport: next => { report = next; },
    });
    const repaired = repairFinalResidualStrictCrossings(skirtRepaired, nodes);
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(baselineQuality.strictCrossings).toBe(2);
    expect(repairedQuality.strictCrossings, JSON.stringify({
      report,
      crossings: findDisplayStrictCrossingHits(repaired).map(hit => ({
        edgeA: repaired[hit.a.edgeIndex]?.id,
        edgeB: repaired[hit.b.edgeIndex]?.id,
        segmentA: hit.a,
        segmentB: hit.b,
      })),
      cost: repaired.find(edge => edge.id === 'edge-tms-cost'),
    }, null, 2)).toBe(0);
    expect(repairedQuality.reverseOverlap).toBe(0);
    expect(repairedQuality.unrelatedOverlap).toBe(0);
    expect(repairedQuality.unexplainedRelatedOverlap).toBe(0);
    expect(repairedQuality.shortEndpointStubs).toBe(0);
    expect(repairedQuality.tinyInteriorDoglegs, JSON.stringify(repaired.map(edge => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      path: edge.data?.computedPath,
    })), null, 2)).toBe(0);
    expect(repairedQuality.hairpins).toBe(0);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
    expect(report?.pairedStrictReduced).toBeGreaterThan(0);
    expect(report?.tripleAccepted).toBeGreaterThan(0);
    const gpsEdge = repaired.find(edge => edge.id === 'edge-gps-tms-execution');
    const driverEdge = repaired.find(edge => edge.id === 'edge-driver-tms-execution');
    if (!gpsEdge || !driverEdge) throw new Error('Expected both shared-target TMS edges.');
    const gpsPath = getDisplayComputedPath(gpsEdge);
    const driverPath = getDisplayComputedPath(driverEdge);
    expect(gpsPath.slice(-3)).toEqual(driverPath.slice(-3));
  });

  it('preserves a source trunk while merging a trapped incoming edge into a shared target trunk', () => {
    const edges: Edge[] = [
      {
        id: 'loms-visibility',
        source: 'loms',
        target: 'visibility',
        sourceHandle: 'right',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 1005.5, y: 593 },
          { x: 1061.5, y: 593 },
          { x: 1061.5, y: 58.5 },
          { x: 1843, y: 58.5 },
          { x: 1843, y: 1360 },
          { x: 1216, y: 1360 },
          { x: 1216, y: 1539 },
        ] },
      },
      {
        id: 'visibility-downstream',
        source: 'visibility',
        target: 'downstream',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1312, y: 1539 },
          { x: 1312, y: 1483 },
          { x: 1711, y: 1483 },
          { x: 1711, y: 179.5 },
        ] },
      },
      {
        id: 'wms-visibility',
        source: 'wms',
        target: 'visibility',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 149, y: 931 },
          { x: 149, y: 1020 },
          { x: 286, y: 1020 },
          { x: 286, y: 1483 },
          { x: 1216, y: 1483 },
          { x: 1216, y: 1539 },
        ] },
      },
      {
        id: 'loms-customs',
        source: 'loms',
        target: 'customs',
        sourceHandle: 'right',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 1005.5, y: 593 },
          { x: 1061.5, y: 593 },
          { x: 1061.5, y: 72 },
          { x: 1531, y: 72 },
          { x: 1531, y: 742 },
          { x: 1428, y: 742 },
          { x: 1428, y: 822 },
        ] },
      },
    ];
    const nodes = [
      node('graph-left', 0, 300, 80, 80),
      node('loms', 826, 533, 179.5, 120),
      node('visibility', 1126.2, 1539, 371.6, 119),
      node('downstream', 1631, 60.5, 160, 119),
      node('wms', 59, 811, 180, 120),
      node('customs', 1338, 822, 180, 119),
    ];
    const sourcePrefix = ((edges[0].data as { computedPath: Array<{ x: number; y: number }> })
      .computedPath).slice(0, 3);
    const siblingSuffix = ((edges[2].data as { computedPath: Array<{ x: number; y: number }> })
      .computedPath).slice(-3);

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    const crossing = findDisplayStrictCrossingHits(edges)[0];
    expect(crossing).toBeDefined();
    if (!crossing) return;
    const candidates = [
      ...buildSharedTargetOuterBridgeCandidates(edges, crossing.a, crossing.b, nodes),
      ...buildSharedTargetOuterBridgeCandidates(edges, crossing.b, crossing.a, nodes),
    ];
    const repaired = candidates.find(candidate => (
      calculateEdgePathQualityScore(candidate).strictCrossings === 0
      && countDisplayObstacleHits(candidate, nodes) === 0
    ));
    expect(repaired).toBeDefined();
    if (!repaired) return;
    const repairedPath = (repaired[0].data as {
      computedPath: Array<{ x: number; y: number }>;
    }).computedPath;
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(repairedQuality.strictCrossings).toBe(0);
    expect(repairedQuality.nonOrthogonalSegments).toBe(0);
    expect(repairedQuality.reverseOverlap).toBe(0);
    expect(repairedQuality.unrelatedOverlap).toBe(0);
    expect(repairedQuality.unexplainedRelatedOverlap).toBe(0);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(repairedPath.slice(0, 3)).toEqual(sourcePrefix);
    expect(repairedPath.slice(-2)).toEqual(siblingSuffix.slice(-2));
    expect(repairedPath[repairedPath.length - 3].y).toBe(siblingSuffix[0].y);
    expect(repairedPath[repairedPath.length - 3].x).toBeLessThanOrEqual(siblingSuffix[0].x);
    expect(repaired[0].sourceHandle).toBe('right');
    expect(repaired[0].targetHandle).toBe('top');
  });

});
