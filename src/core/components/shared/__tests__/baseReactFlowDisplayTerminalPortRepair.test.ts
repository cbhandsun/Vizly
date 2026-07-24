// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import tmsStandardData from '../../../../data/standardized/TmsStandardData.json';
import wmsStandardData from '../../../../data/standardized/WmsStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import {
  repairAxisMismatchedTerminalsWithBoundedPortRoles,
  repairTerminalHandleHemisphereHairpins,
} from '../baseReactFlowDisplayTerminalPortRepair';
import { repairRenderSafeTerminalAxes } from '../baseReactFlowRenderTerminalSafety';
import {
  buildBoundedSharedPortLaneSchedule,
  interleaveBoundedRepairCandidates,
  repairSharedPortAndTinyTerminalLanes,
} from '../baseReactFlowDisplaySharedPortLaneRepair';
import { displayEdgesHaveNodeAnchoredTerminals } from '../baseReactFlowTerminalAxisRepair';
import { node, withAbsoluteNodePositions } from './baseReactFlowDisplayEdges.testUtils';
import { tmsResidualStrictPaths } from './fixtures/tmsResidualStrictPaths';

const displayEdge = (
  id: string,
  source: string,
  target: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source,
  target,
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'advanced-smart-step',
  data: {
    computedPath,
    layoutDirection: 'LR',
  },
});

describe('baseReactFlowDisplayTerminalPortRepair', () => {
  it('repairs a handle hemisphere hairpin and keeps tree routing in sync', () => {
    const computedPath = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: -20 },
      { x: 120, y: -20 },
    ];
    const edges: Edge[] = [{
      id: 'hemisphere-hairpin',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath,
        treeRouting: { points: computedPath, version: 1 },
      },
    }];

    const repaired = repairTerminalHandleHemisphereHairpins(edges, []);
    const repairedData = repaired[0].data as Record<string, any>;

    expect(repaired).not.toBe(edges);
    expect(repairedData.terminalHandleHemisphereRepaired).toBe(true);
    expect(repairedData.treeRouting).toMatchObject({ version: 1 });
    expect(repairedData.treeRouting.points).toEqual(repairedData.computedPath);
    expect(calculateEdgePathQualityScore(repaired).hairpins).toBe(0);
  });

  it('preserves the edge array when no hemisphere repair applies', () => {
    const edges: Edge[] = [{
      id: 'straight',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 60, y: 0 },
          { x: 120, y: 0 },
          { x: 180, y: 0 },
        ],
      },
    }];

    expect(repairTerminalHandleHemisphereHairpins(edges, [])).toBe(edges);
  });

  it('replaces a rendered boundary trunk with a direct declared target stub', () => {
    const nodes: Node[] = [
      node('l-oms', 826.5, 534, 179, 118),
      node('tms', 820, 812, 192, 118),
    ];
    const routed: Edge[] = [{
      id: 'loms-tms',
      source: 'l-oms',
      target: 'tms',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 860, y: 652 },
          { x: 860, y: 811 },
          { x: 916, y: 811 },
        ],
      },
    }];

    const repaired = repairRenderSafeTerminalAxes(routed, nodes);
    const path = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(repaired).not.toBe(routed);
    expect(path.at(-1)).toEqual({ x: 916, y: 812 });
    expect(path.at(-2)).toEqual({ x: 916, y: 756 });
    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
  });

  it('fans a GPS target stub around neighboring TMS terminal lanes', () => {
    const nodes: Node[] = [
      node('gps', 1179.8, 523, 128, 96),
      node('tms-execution', 1360.62, 1986, 152, 96),
    ];
    const routed: Edge[] = [
      {
        id: 'gps-execution', source: 'gps', target: 'tms-execution', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 1244, y: 620 }, { x: 1244, y: 994 }, { x: 1554, y: 994 }, { x: 1554, y: 1985 }, { x: 1437, y: 1985 }] },
      },
      {
        id: 'driver-execution', source: 'driver', target: 'tms-execution', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 1451, y: 1187 }, { x: 1451, y: 1255 }, { x: 1537, y: 1255 }, { x: 1537, y: 1930 }, { x: 1461, y: 1930 }, { x: 1461, y: 1986 }] },
      },
      {
        id: 'tms-cost', source: 'planning', target: 'cost',
        data: { computedPath: [{ x: 1461, y: 1826 }, { x: 1461, y: 1954 }, { x: 1509, y: 1954 }, { x: 1509, y: 1978 }, { x: 1554, y: 1978 }, { x: 1554, y: 2002 }] },
      },
      {
        id: 'planning-execution', source: 'planning', target: 'tms-execution',
        data: { computedPath: [{ x: 1437, y: 1826 }, { x: 1437, y: 1985 }] },
      },
    ];
    const baselineQuality = calculateEdgePathQualityScore(routed);

    const repaired = repairRenderSafeTerminalAxes(routed, nodes, 128);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const gpsPath = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(repaired).not.toBe(routed);
    expect(gpsPath.at(-1)?.y).toBe(1986);
    expect(gpsPath.at(-2)?.x).toBe(gpsPath.at(-1)?.x);
    expect(repairedQuality.nonOrthogonalSegments).toBe(0);
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
  });

  it('uses a declared handle to disambiguate a node-corner terminal', () => {
    const nodes: Node[] = [
      node('source', 3495.6, 776.5, 216, 73),
      node('target', 4043, 760, 150, 78),
    ];
    const routed = displayEdge('declared-corner', 'source', 'target', [
      { x: 3711.6, y: 849.5 },
      { x: 3769, y: 849.5 },
      { x: 3769, y: 799 },
      { x: 4043, y: 799 },
    ]);

    expect(displayEdgesHaveNodeAnchoredTerminals([routed], nodes)).toBe(true);
  });

  it('nudges declared side terminals inward when they land on a node corner', () => {
    const nodes: Node[] = [
      node('source', 3495.6, 776.5, 216, 73),
      node('target', 4043, 760, 150, 78),
    ];
    const routed = displayEdge('corner-routed', 'source', 'target', [
      { x: 3711.6, y: 849.5 },
      { x: 3711.6, y: 799 },
      { x: 3769, y: 799 },
      { x: 4043, y: 799 },
    ]);
    routed.data = { ...(routed.data as Record<string, unknown>), sourcePortPolicy: 'fixed' };
    const baselineQuality = calculateEdgePathQualityScore([routed]);

    expect(displayEdgesHaveNodeAnchoredTerminals([routed], nodes)).toBe(false);
    const repaired = repairAxisMismatchedTerminalsWithBoundedPortRoles([routed], nodes, 64);
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(baselineQuality.nonOrthogonalSegments);
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap).toBeLessThanOrEqual(
      baselineQuality.unexplainedRelatedOverlap,
    );
  });

  it('repairs declared terminal-axis mismatches in graphs larger than 24 edges', () => {
    const nodes: Node[] = [
      node('source', 0, 0, 100, 100),
      node('target', 300, 0, 100, 100),
      node('blocker', 140, 120, 100, 80),
    ];
    const routed = displayEdge('routed', 'source', 'target', [
      { x: 50, y: 100 },
      { x: 50, y: 160 },
      { x: 350, y: 160 },
      { x: 350, y: 100 },
    ]);
    const fillers = Array.from({ length: 24 }, (_, index) => displayEdge(
      `filler-${index}`,
      'source',
      'target',
      [],
    ));
    const edges = [routed, ...fillers];
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const baselineObstacleHits = countDisplayObstacleHits(edges, nodes);

    const repaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(edges, nodes, 16);
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(repaired).not.toBe(edges);
    expect(displayEdgesHaveNodeAnchoredTerminals([repaired[0]], nodes)).toBe(true);
    expect(
      countDisplayObstacleHits(repaired, nodes),
      JSON.stringify((repaired[0].data as any)?.computedPath, null, 2),
    ).toBeLessThan(baselineObstacleHits);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(baselineQuality.nonOrthogonalSegments);
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap).toBeLessThanOrEqual(
      baselineQuality.unexplainedRelatedOverlap,
    );
  });

  it('rejects an obstacle-only improvement that leaves the declared terminal axis invalid', () => {
    const nodes: Node[] = [
      node('operation', 3495.6, 776.5, 216, 73),
      node('loading-handover', 4042.6, 1223, 130, 60),
      node('wcs-integration', 4031.6, 1443, 152, 73),
    ];
    const loading = displayEdge('loading', 'operation', 'loading-handover', [
      { x: 3700, y: 850 },
      { x: 3700, y: 1496 },
      { x: 4042, y: 1496 },
      { x: 4042, y: 1253 },
    ]);
    const executionPaths = [
      [{ x: 3712, y: 850 }, { x: 3767, y: 850 }, { x: 3767, y: 881 }, { x: 4813, y: 881 }],
      [{ x: 3712, y: 850 }, { x: 3712, y: 917 }, { x: 4210, y: 917 }, { x: 4210, y: 1809 }],
      [{ x: 3712, y: 802 }, { x: 3712, y: 1496 }, { x: 4011, y: 1496 }, { x: 4011, y: 1528 }],
      [{ x: 3712, y: 850 }, { x: 3768, y: 850 }, { x: 3768, y: 905 }, { x: 4294, y: 905 }, { x: 4294, y: 1349 }],
      [{ x: 3711.6, y: 850 }, { x: 3760, y: 850 }, { x: 3760, y: 905 }, { x: 4290, y: 905 }, { x: 4290, y: 1582 }],
      [{ x: 3711.6, y: 850 }, { x: 3760, y: 850 }, { x: 3760, y: 917 }, { x: 3860, y: 917 }, { x: 3860, y: 1480 }, { x: 4031, y: 1480 }],
    ];
    const executionEdges = executionPaths.map((path, index) => displayEdge(
      `execution-${index}`,
      'operation',
      index === executionPaths.length - 1 ? 'wcs-integration' : `execution-target-${index}`,
      path,
    ));
    const fillers = Array.from({ length: 18 }, (_, index) => displayEdge(
      `local-filler-${index}`,
      'filler-source',
      'filler-target',
      [],
    ));
    const edges = [loading, ...executionEdges, ...fillers];
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const baselineObstacleHits = countDisplayObstacleHits(edges, nodes);

    const repaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(edges, nodes, 16);
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(repaired[0]).toBe(loading);
    expect(
      countDisplayObstacleHits(repaired, nodes),
      JSON.stringify((repaired[0].data as any)?.computedPath, null, 2),
    ).toBeLessThanOrEqual(baselineObstacleHits);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(baselineQuality.nonOrthogonalSegments);
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap).toBeLessThanOrEqual(
      baselineQuality.unexplainedRelatedOverlap,
    );
  });

  it('keeps an existing outer lane while repairing a tangential target-side slide', async () => {
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
    const targetIndex = edges.findIndex(edge => edge.id === 'edge-tms-cost');
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const baselineObstacleHits = countDisplayObstacleHits(edges, nodes);

    expect(targetIndex).toBeGreaterThanOrEqual(0);
    expect(displayEdgesHaveNodeAnchoredTerminals([edges[targetIndex]], nodes)).toBe(false);

    const repaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(edges, nodes, 64);
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(
      displayEdgesHaveNodeAnchoredTerminals([repaired[targetIndex]], nodes),
      JSON.stringify({
        baseline: {
          sourceHandle: edges[targetIndex].sourceHandle,
          targetHandle: edges[targetIndex].targetHandle,
          data: edges[targetIndex].data,
        },
        repaired: {
          sourceHandle: repaired[targetIndex].sourceHandle,
          targetHandle: repaired[targetIndex].targetHandle,
          data: repaired[targetIndex].data,
        },
      }, null, 2),
    ).toBe(true);
    expect(countDisplayObstacleHits(repaired, nodes)).toBeLessThanOrEqual(baselineObstacleHits);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(baselineQuality.nonOrthogonalSegments);
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap).toBeLessThanOrEqual(
      baselineQuality.unexplainedRelatedOverlap,
    );
  }, 120_000);

  it('translates a numerically short terminal staircase without shrinking its 24px lane', () => {
    const nodes: Node[] = [
      node('source', 2699.2, 1157, 96, 96),
      node('target', 3122, 972, 96, 96),
    ];
    const routed: Edge[] = [{
      id: 'short-terminal-staircase',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 2795.2, y: 1205 }, { x: 2843, y: 1205 },
          { x: 2843, y: 1133 }, { x: 2867, y: 1133 },
          { x: 2867, y: 1020 }, { x: 3122, y: 1020 },
        ],
      },
    }];
    const baselineQuality = calculateEdgePathQualityScore(routed);

    expect(displayEdgesHaveNodeAnchoredTerminals(routed, nodes)).toBe(false);
    const repaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(routed, nodes, 16);
    const repairedPath = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
    expect(repairedPath).toEqual([
      { x: 2795.2, y: 1205 }, { x: 2843.2, y: 1205 },
      { x: 2843.2, y: 1133 }, { x: 2867.2, y: 1133 },
      { x: 2867.2, y: 1020 }, { x: 3122, y: 1020 },
    ]);
    expect(repairedQuality.tinyInteriorDoglegs).toBe(baselineQuality.tinyInteriorDoglegs);
    expect(repairedQuality.shortEndpointStubs).toBeLessThanOrEqual(baselineQuality.shortEndpointStubs);
  });

  it('prioritizes numerical staircase drift before general port search exhausts the budget', () => {
    const nodes: Node[] = [
      node('noise-source', -500, 0, 96, 96),
      node('noise-target', -100, 200, 96, 96),
      node('source', 2699.2, 1157, 96, 96),
      node('target', 3122, 972, 96, 96),
    ];
    const routed: Edge[] = [{
      id: 'general-axis-mismatch',
      source: 'noise-source',
      target: 'noise-target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: -404, y: 48 }, { x: -404, y: 120 },
          { x: -148, y: 120 }, { x: -148, y: 248 }, { x: -100, y: 248 },
        ],
      },
    }, {
      id: 'numerical-staircase-drift',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 2795.2, y: 1205 }, { x: 2843, y: 1205 },
          { x: 2843, y: 1133 }, { x: 2867, y: 1133 },
          { x: 2867, y: 1020 }, { x: 3122, y: 1020 },
        ],
      },
    }];

    const repaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(routed, nodes, 1);
    expect((repaired[1].data as any).computedPath).toEqual([
      { x: 2795.2, y: 1205 }, { x: 2843.2, y: 1205 },
      { x: 2843.2, y: 1133 }, { x: 2867.2, y: 1133 },
      { x: 2867.2, y: 1020 }, { x: 3122, y: 1020 },
    ]);
  });

  it('repairs multiple subpixel-short WMS source stubs in one bounded transaction', async () => {
    const canvas = await standardDataToCanvas(wmsStandardData as any);
    const nodes = withAbsoluteNodePositions(canvas.nodes as any);
    const paths: Record<string, Array<{ x: number; y: number }>> = {
      e_inv_replen: [
        { x: 2385.34, y: 158 }, { x: 2433, y: 158 }, { x: 2433, y: 110 },
        { x: 3274.54, y: 110 }, { x: 3274.54, y: 182 }, { x: 3322.54, y: 182 },
      ],
      e_receipt_bi: [
        { x: 1326.28, y: 451 }, { x: 1374, y: 451 }, { x: 1374, y: 375 },
        { x: 1974, y: 375 }, { x: 1974, y: 418 }, { x: 4822, y: 418 },
        { x: 4822, y: 506 }, { x: 4912, y: 506 },
      ],
    };
    const edges = canvas.edges
      .filter(edge => paths[edge.id])
      .map(edge => ({
        ...edge,
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { ...(edge.data as any), computedPath: paths[edge.id] },
      }));

    expect(displayEdgesHaveNodeAnchoredTerminals(edges, nodes)).toBe(false);
    const repaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(edges, nodes, 32);

    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
    expect(repaired.filter((edge, index) => edge !== edges[index])).toHaveLength(2);
  }, 30_000);

  it('separates a shared right-port return lane and normalizes bounded tiny staircases', () => {
    const nodes: Node[] = [
      node('labor-schedule-feedback', 5366.4, 1552, 138, 60),
      node('task-group', 2651.2, 1204.5, 144, 96),
      node('cutoff-grouping', 3134.7, 1669, 97, 73),
      node('priority-sequence', 3118.2, 1449, 130, 60),
      node('operation', 3495.6, 776.5, 216, 73),
      node('replenish-exec', 4047.6, 317, 120, 73),
    ];
    const edges: Edge[] = [
      {
        id: 'e-labor-group-fb', source: 'labor-schedule-feedback', target: 'task-group',
        sourceHandle: 'right', targetHandle: 'right',
        data: { treeRouting: { points: [] }, computedPath: [
          { x: 5504.4, y: 1582 }, { x: 5552.4, y: 1582 },
          { x: 5552.4, y: 2084 }, { x: 3342, y: 2084 },
          { x: 3342, y: 1298 }, { x: 2795, y: 1298 }, { x: 2795, y: 1253 },
        ] },
      },
      {
        id: 'e-cutoff', source: 'task-group', target: 'cutoff-grouping',
        sourceHandle: 'right', targetHandle: 'left',
        data: { treeRouting: { points: [] }, computedPath: [
          { x: 2795.2, y: 1301 }, { x: 2843.2, y: 1301 },
          { x: 2843.2, y: 1349 }, { x: 2867, y: 1349 },
          { x: 2867, y: 1706 }, { x: 3135, y: 1706 },
        ] },
      },
      {
        id: 'e-priority-seq', source: 'task-group', target: 'priority-sequence',
        sourceHandle: 'right', targetHandle: 'left',
        data: { treeRouting: { points: [] }, computedPath: [
          { x: 2795.2, y: 1301 }, { x: 2843.2, y: 1301 },
          { x: 2843.2, y: 1394 }, { x: 2867, y: 1394 },
          { x: 2867, y: 1479 }, { x: 3118, y: 1479 },
        ] },
      },
      {
        id: 'e-replenish-exec', source: 'operation', target: 'replenish-exec',
        sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [
          { x: 3711.6, y: 777 }, { x: 3759.6, y: 777 },
          { x: 3759.6, y: 722 }, { x: 3768, y: 722 },
          { x: 3768, y: 354 }, { x: 4048, y: 354 },
        ] },
      },
    ];
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const baselineObstacleHits = countDisplayObstacleHits(edges, nodes);

    expect({
      reverseOverlap: baselineQuality.reverseOverlap,
      unexplainedRelatedOverlap: baselineQuality.unexplainedRelatedOverlap,
      tinyInteriorDoglegs: baselineQuality.tinyInteriorDoglegs,
    }).toEqual({
      reverseOverlap: 96,
      unexplainedRelatedOverlap: 96,
      tinyInteriorDoglegs: 3,
    });
    expect([1, 2].map(index => {
      const pairQuality = calculateEdgePathQualityScore([edges[0], edges[index]]);
      return {
        reverseOverlap: pairQuality.reverseOverlap,
        unexplainedRelatedOverlap: pairQuality.unexplainedRelatedOverlap,
      };
    })).toEqual([
      { reverseOverlap: 48, unexplainedRelatedOverlap: 48 },
      { reverseOverlap: 48, unexplainedRelatedOverlap: 48 },
    ]);

    const repaired = repairSharedPortAndTinyTerminalLanes(edges, nodes, 8);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const laborPath = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const replenishPath = (repaired[3].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
    expect(countDisplayObstacleHits(repaired, nodes)).toBeLessThanOrEqual(baselineObstacleHits);
    expect({
      nonOrthogonalSegments: repairedQuality.nonOrthogonalSegments,
      strictCrossings: repairedQuality.strictCrossings,
      reverseOverlap: repairedQuality.reverseOverlap,
      unrelatedOverlap: repairedQuality.unrelatedOverlap,
      unexplainedRelatedOverlap: repairedQuality.unexplainedRelatedOverlap,
      shortEndpointStubs: repairedQuality.shortEndpointStubs,
      tinyInteriorDoglegs: repairedQuality.tinyInteriorDoglegs,
      hairpins: repairedQuality.hairpins,
    }).toEqual({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
    });
    expect(laborPath.slice(-4)).toEqual([
      { x: 3342, y: 1298 }, { x: 2843.2, y: 1298 },
      { x: 2843.2, y: 1274 }, { x: 2795.2, y: 1274 },
    ]);
    expect(replenishPath).toEqual([
      { x: 3711.6, y: 777 }, { x: 3768, y: 777 },
      { x: 3768, y: 354 }, { x: 4048, y: 354 },
    ]);
    expect([1, 2].map(index => {
      const pairQuality = calculateEdgePathQualityScore([repaired[0], repaired[index]]);
      return {
        reverseOverlap: pairQuality.reverseOverlap,
        unexplainedRelatedOverlap: pairQuality.unexplainedRelatedOverlap,
      };
    })).toEqual([
      { reverseOverlap: 0, unexplainedRelatedOverlap: 0 },
      { reverseOverlap: 0, unexplainedRelatedOverlap: 0 },
    ]);

    const exactTargetLockedEdges = edges.map((edge, index) => (
      index === 0
        ? {
          ...edge,
          targetHandle: 'task-group-right-port-3',
          data: {
            ...(edge.data || {}),
            manualHandles: { target: true },
          },
        }
        : edge
    ));
    const exactTargetLockedRepair = repairSharedPortAndTinyTerminalLanes(
      exactTargetLockedEdges,
      nodes,
      8,
    );
    const exactTargetLockedPath = (exactTargetLockedRepair[0].data as any)
      .computedPath as Array<{ x: number; y: number }>;
    expect(exactTargetLockedRepair[0].targetHandle).toBe('task-group-right-port-3');
    expect(exactTargetLockedPath.at(-1)).toEqual({ x: 2795.2, y: 1253 });

    const nodesWithBridgeBlocker: Node[] = [
      ...nodes,
      node('bridge-blocker-source', 2809, 1100, 20, 20),
      node('bridge-blocker-target', 2953, 1100, 20, 20),
    ];
    const bridgeBlocker: Edge = {
      id: 'bridge-blocker',
      source: 'bridge-blocker-source',
      target: 'bridge-blocker-target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 2819, y: 1120 }, { x: 2819, y: 1259 },
        { x: 2963, y: 1259 }, { x: 2963, y: 1120 },
      ] },
    };
    const edgesWithBridgeBlocker = [...edges, bridgeBlocker];
    const centerTangentCandidate = edgesWithBridgeBlocker.map((edge, index) => (
      index === 0
        ? {
          ...edge,
          data: { ...(edge.data || {}), computedPath: [
            { x: 5504.4, y: 1582 }, { x: 5552.4, y: 1582 },
            { x: 5552.4, y: 2084 }, { x: 3342, y: 2084 },
            { x: 3342, y: 1298 }, { x: 2843.2, y: 1298 },
            { x: 2843.2, y: 1252.5 }, { x: 2795.2, y: 1252.5 },
          ] },
        }
        : edge
    ));
    expect(calculateEdgePathQualityScore(centerTangentCandidate).strictCrossings).toBeGreaterThan(0);
    const blockerBaselineObstacleHits = countDisplayObstacleHits(
      edgesWithBridgeBlocker,
      nodesWithBridgeBlocker,
    );
    const blockerRepaired = repairSharedPortAndTinyTerminalLanes(
      edgesWithBridgeBlocker,
      nodesWithBridgeBlocker,
      8,
    );
    const blockerQuality = calculateEdgePathQualityScore(blockerRepaired);
    expect(displayEdgesHaveNodeAnchoredTerminals(blockerRepaired, nodesWithBridgeBlocker)).toBe(true);
    expect(countDisplayObstacleHits(blockerRepaired, nodesWithBridgeBlocker))
      .toBeLessThanOrEqual(blockerBaselineObstacleHits);
    expect({
      nonOrthogonalSegments: blockerQuality.nonOrthogonalSegments,
      strictCrossings: blockerQuality.strictCrossings,
      reverseOverlap: blockerQuality.reverseOverlap,
      unrelatedOverlap: blockerQuality.unrelatedOverlap,
      unexplainedRelatedOverlap: blockerQuality.unexplainedRelatedOverlap,
      shortEndpointStubs: blockerQuality.shortEndpointStubs,
      tinyInteriorDoglegs: blockerQuality.tinyInteriorDoglegs,
      hairpins: blockerQuality.hairpins,
    }).toEqual({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
    });
    expect(((blockerRepaired[0].data as any).computedPath as Array<{ x: number; y: number }>).slice(-4))
      .toEqual([
        { x: 3342, y: 1298 }, { x: 2843.2, y: 1298 },
        { x: 2843.2, y: 1274 }, { x: 2795.2, y: 1274 },
      ]);
    expect(buildBoundedSharedPortLaneSchedule(
      [10, 20, 30, 40],
      [100, 124, 148],
      5,
    )).toEqual([
      { tangent: 10, bridge: 100 },
      { tangent: 20, bridge: 100 },
      { tangent: 30, bridge: 100 },
      { tangent: 40, bridge: 100 },
      { tangent: 10, bridge: 124 },
    ]);
    expect(interleaveBoundedRepairCandidates(
      ['numeric-1', 'numeric-2', 'numeric-3', 'numeric-4', 'numeric-5'],
      ['shared-1', 'shared-2'],
      6,
    )).toEqual([
      'numeric-1', 'shared-1',
      'numeric-2', 'shared-2',
      'numeric-3', 'numeric-4',
    ]);
  });

  it('collapses paired terminal micro-stairs before spending the bounded lane budget', () => {
    const edge = (
      id: string,
      source: string,
      target: string,
      sourceHandle: string,
      targetHandle: string,
      computedPath: Array<{ x: number; y: number }>,
    ): Edge => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: 'advanced-smart-step',
      data: { computedPath, layoutDirection: 'TB' },
    });
    const edges = [
      edge('loms-tms', 'loms', 'tms', 'bottom', 'top', [
        { x: 1323, y: 802 }, { x: 1323, y: 962 },
      ]),
      edge('loms-wms', 'loms', 'wms', 'bottom', 'right', [
        { x: 1323, y: 802 }, { x: 1323, y: 899 }, { x: 1306, y: 899 },
        { x: 1306, y: 923 }, { x: 510, y: 923 }, { x: 510, y: 1080 },
        { x: 462, y: 1080 },
      ]),
      edge('tms-carrier', 'tms', 'carrier', 'top', 'bottom', [
        { x: 1306, y: 962 }, { x: 1306, y: 865 }, { x: 1323, y: 865 },
        { x: 1323, y: 889 }, { x: 1769, y: 889 }, { x: 1769, y: 277 },
      ]),
    ];
    const nodes = [
      node('loms', 1120.25, 605, 406, 197),
      node('tms', 1113.25, 962, 420, 236),
      node('wms', 42, 962, 420, 236),
      node('carrier', 1608.5, 80, 322, 197),
    ];

    expect(calculateEdgePathQualityScore(edges)).toMatchObject({
      tinyInteriorDoglegs: 2,
      hairpins: 1,
    });

    const repaired = repairSharedPortAndTinyTerminalLanes(edges, nodes, 8);

    expect(displayEdgesHaveNodeAnchoredTerminals(repaired, nodes)).toBe(true);
    expect(calculateEdgePathQualityScore(repaired)).toMatchObject({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
    });
  });
});
