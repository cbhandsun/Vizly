import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
  repairBusinessNodeClearanceRisks,
  uniqueBusinessNodeClearancePaths,
} from '../edgeBusinessNodeClearanceRepair';
import { createBusinessNodeClearanceCandidateCollection } from '../edgeBusinessNodeClearanceCandidateCollection';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import {
  createNodeClearanceEvaluationContext,
  createNodeClearanceGraphEvaluationContext,
  scoreNodeClearanceRisk,
} from '../edgeWaypointCandidateRepair';

const pathFor = (edge: Edge): Array<{ x: number; y: number }> => (
  (edge.data as { computedPath?: Array<{ x: number; y: number }> } | undefined)?.computedPath ?? []
);

describe('repairBusinessNodeClearanceRisks', () => {
  it('scores routing and commercial clearance in one parity-preserving scan', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 40, height: 40 } },
      { id: 'blocker', position: { x: 100, y: 40 }, data: {}, measured: { width: 60, height: 60 } },
      { id: 'target', position: { x: 240, y: 0 }, data: {}, measured: { width: 40, height: 40 } },
    ];
    const edge: Edge = { id: 'edge', source: 'source', target: 'target' };
    const path = [{ x: 40, y: 20 }, { x: 240, y: 20 }];
    const context = createNodeClearanceEvaluationContext(nodes, edge);

    expect(context.scorePair(
      path,
      COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toEqual([
      context.score(path, COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE),
      context.score(path, COMMERCIAL_BUSINESS_NODE_CLEARANCE),
    ]);
    expect(context.scorePair(path, Number.NaN, Number.POSITIVE_INFINITY)).toEqual([
      context.score(path, Number.NaN),
      context.score(path, Number.POSITIVE_INFINITY),
    ]);
  });

  it('keeps the first occurrence of each exact candidate geometry', () => {
    const first = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const duplicate = first.map(point => ({ ...point }));
    const distinct = [{ x: 0, y: 0 }, { x: 0, y: 100 }];

    expect(uniqueBusinessNodeClearancePaths([first, duplicate, distinct]))
      .toEqual([first, distinct]);
    const collection = createBusinessNodeClearanceCandidateCollection();
    collection.addAll([first, duplicate, distinct]);
    expect(collection.read()).toEqual({
      generatedCandidateCount: 3,
      paths: [first, distinct],
    });
  });

  it('normalizes a sibling branch lane from 41.5px to the 48px commercial boundary', () => {
    const nodes: Node[] = [
      { id: 'order-input', position: { x: 102, y: 1534 }, data: {}, measured: { width: 190, height: 96 } },
      { id: 'order-sla-classify', position: { x: 622.5, y: 1545.5 }, data: {}, measured: { width: 191, height: 73 } },
      { id: 'order-split-merge', position: { x: 643, y: 1778.5 }, data: {}, measured: { width: 191, height: 73 } },
    ];
    const edges: Edge[] = [
      {
        id: 'e-order-sla',
        source: 'order-input',
        target: 'order-sla-classify',
        data: { computedPath: [{ x: 292, y: 1582 }, { x: 622.5, y: 1582 }] },
      },
      {
        id: 'e-order-split',
        source: 'order-input',
        target: 'order-split-merge',
        data: {
          computedPath: [
            { x: 292, y: 1582 },
            { x: 581, y: 1582 },
            { x: 581, y: 1815 },
            { x: 643, y: 1815 },
          ],
          sharedTrunkAware: true,
          sharedTrunkSynthesized: true,
        },
      },
    ];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes, {
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    });
    const graphClearance = createNodeClearanceGraphEvaluationContext(nodes);

    expect(scoreNodeClearanceRisk(
      pathFor(edges[1]),
      nodes,
      edges[1],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBeGreaterThan(0);
    expect(graphClearance.score(
      pathFor(edges[1]),
      edges[1],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(scoreNodeClearanceRisk(
      pathFor(edges[1]),
      nodes,
      edges[1],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ));
    expect(scoreNodeClearanceRisk(
      pathFor(repaired[1]),
      nodes,
      repaired[1],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
    expect(pathFor(repaired[1])).toEqual([
      { x: 292, y: 1582 },
      { x: 574.5, y: 1582 },
      { x: 574.5, y: 1815 },
      { x: 643, y: 1815 },
    ]);
  });

  it('moves an internal lane away from a business node without leaving its container', () => {
    const nodes: Node[] = [
      { id: 'container', type: 'titleGroup', position: { x: 0, y: 0 }, data: {}, measured: { width: 500, height: 300 } },
      { id: 'source', position: { x: 80, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'nearby', position: { x: 32, y: 90 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'target', position: { x: 300, y: 220 }, data: {}, measured: { width: 80, height: 60 } },
    ];
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [
        { x: 120, y: 60 },
        { x: 120, y: 70 },
        { x: 23, y: 70 },
        { x: 23, y: 190 },
        { x: 340, y: 190 },
        { x: 340, y: 220 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes);
    const repairedPath = pathFor(repaired[0]);

    expect(scoreNodeClearanceRisk(repairedPath, nodes, repaired[0])).toBeLessThan(
      scoreNodeClearanceRisk(pathFor(edges[0]), nodes, edges[0]),
    );
    expect(repairedPath[2].x).toBeGreaterThanOrEqual(0);
    expect(repairedPath[3].x).toBeGreaterThanOrEqual(0);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });

  it('doglegs a target-trunk endpoint segment around an intervening business node', () => {
    const nodes: Node[] = [
      { id: 'container', type: 'titleGroup', position: { x: 0, y: 0 }, data: {}, measured: { width: 500, height: 440 } },
      { id: 'loms', position: { x: 20, y: 20 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'yms', position: { x: 260, y: 140 }, data: {}, measured: { width: 100, height: 80 } },
      { id: 'visibility', position: { x: 280, y: 320 }, data: {}, measured: { width: 100, height: 80 } },
    ];
    const edges: Edge[] = [{
      id: 'edge-loms-visibility',
      source: 'loms',
      target: 'visibility',
      sourceHandle: 'right',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 120, y: 50 },
          { x: 330, y: 50 },
          { x: 330, y: 320 },
        ],
      },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes);
    const originalPath = pathFor(edges[0]);
    const repairedPath = pathFor(repaired[0]);

    expect(scoreNodeClearanceRisk(originalPath, nodes, edges[0])).toBeGreaterThan(0);
    expect(scoreNodeClearanceRisk(repairedPath, nodes, repaired[0])).toBe(0);
    expect(repairedPath.length).toBeGreaterThan(originalPath.length);
    expect(repairedPath.slice(0, 2)).toEqual(originalPath.slice(0, 2));
    expect(repairedPath.at(-1)).toEqual(originalPath.at(-1));
    expect((repairedPath.at(-2)?.y ?? 0)).toBeGreaterThanOrEqual(268);
    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });

  it('escapes sideways when the first segment starts inside a sibling clearance zone', () => {
    const nodes: Node[] = [
      { id: 'container', type: 'titleGroup', position: { x: 0, y: 700 }, data: {}, measured: { width: 1700, height: 1000 } },
      { id: 'source', position: { x: 217, y: 828 }, data: {}, measured: { width: 298, height: 118 } },
      { id: 'sibling', position: { x: 32, y: 1090 }, data: {}, measured: { width: 298, height: 118 } },
      { id: 'target', position: { x: 1286, y: 1540 }, data: {}, measured: { width: 296, height: 118 } },
    ];
    const edges: Edge[] = [{
      id: 'edge', source: 'source', target: 'target',
      sourceHandle: 'bottom', targetHandle: 'left',
      data: { computedPath: [
        { x: 366, y: 946 }, { x: 366, y: 1599 }, { x: 1286, y: 1599 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes);
    const repairedPath = pathFor(repaired[0]);

    expect(repairedPath.length).toBeGreaterThan(3);
    expect(repairedPath[0]).toEqual({ x: 366, y: 946 });
    expect(repairedPath.at(-1)).toEqual({ x: 1286, y: 1599 });
    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });

  it('uses the commercial lane at a diagonal WMS sibling corner', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 205, y: 816 }, data: {}, measured: { width: 298, height: 118 } },
      { id: 'wcs', position: { x: 32, y: 1090 }, data: {}, measured: { width: 298, height: 118 } },
      { id: 'target', position: { x: 1286, y: 1540 }, data: {}, measured: { width: 296, height: 118 } },
    ];
    const edges: Edge[] = [{
      id: 'edge-wms-visibility',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'left',
      data: { computedPath: [
        { x: 354, y: 934 },
        { x: 354, y: 1050 },
        { x: 458, y: 1050 },
        { x: 458, y: 1248 },
        { x: 354, y: 1248 },
        { x: 354, y: 1599 },
        { x: 1286, y: 1599 },
      ] },
    }];

    expect(scoreNodeClearanceRisk(
      pathFor(edges[0]),
      nodes,
      edges[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBeGreaterThan(0);

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes);

    expect(scoreNodeClearanceRisk(
      pathFor(repaired[0]),
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ), JSON.stringify(pathFor(repaired[0]))).toBe(0);
    expect(pathFor(repaired[0])[0]).toEqual({ x: 354, y: 934 });
    expect(pathFor(repaired[0]).at(-1)).toEqual({ x: 1286, y: 1599 });
  });

  it('routes one endpoint segment around a narrow multi-node corridor', () => {
    const nodes: Node[] = [
      { id: 'logistics', type: 'titleGroup', position: { x: 0, y: 450 }, data: {}, measured: { width: 1882, height: 846 } },
      { id: 'data', type: 'titleGroup', position: { x: 1254.3375, y: 1456 }, data: {}, measured: { width: 404, height: 290 } },
      { id: 'external', type: 'titleGroup', position: { x: 758.1125, y: 0 }, data: {}, measured: { width: 1377, height: 290 } },
      { id: 'visibility', position: { x: 1286.3375, y: 1540 }, data: {}, measured: { width: 296, height: 118 } },
      { id: 'downstream', position: { x: 1851.1125, y: 106.5 }, data: {}, measured: { width: 219, height: 73 } },
      { id: 'yms', position: { x: 1213, y: 1090 }, data: {}, measured: { width: 250, height: 118 } },
      { id: 'customs', position: { x: 1525.75, y: 823 }, data: {}, measured: { width: 282, height: 96 } },
    ];
    const edges: Edge[] = [{
      id: 'edge-visibility-downstream',
      source: 'visibility',
      target: 'downstream',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 1502, y: 1540 },
        { x: 1502, y: 242 },
        { x: 1875.1125, y: 242 },
        { x: 1875.1125, y: 179.5 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes);
    const originalPath = pathFor(edges[0]);
    const repairedPath = pathFor(repaired[0]);

    expect(scoreNodeClearanceRisk(
      originalPath,
      nodes,
      edges[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBeGreaterThan(0);
    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ), JSON.stringify(repairedPath)).toBe(0);
    expect(repairedPath[0]).toEqual(originalPath[0]);
    expect(repairedPath.at(-1)).toEqual(originalPath.at(-1));
    expect(repairedPath.some(point => point.x >= 1855.75)).toBe(true);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });

  it('uses the bounded container-edge margin needed for visible DOM clearance', () => {
    const nodes: Node[] = [
      { id: 'container', type: 'titleGroup', position: { x: 0, y: 20 }, data: {}, measured: { width: 520, height: 320 } },
      { id: 'source', position: { x: 20, y: 30 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'blocker', position: { x: 220, y: 68 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'target', position: { x: 420, y: 30 }, data: {}, measured: { width: 80, height: 60 } },
    ];
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [
        { x: 100, y: 60 },
        { x: 140, y: 60 },
        { x: 140, y: 20 },
        { x: 380, y: 20 },
        { x: 380, y: 60 },
        { x: 420, y: 60 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes);
    const repairedPath = pathFor(repaired[0]);

    expect(repairedPath).not.toEqual(pathFor(edges[0]));
    expect(Math.min(...repairedPath.map(point => point.y))).toBeLessThan(20);
    expect(Math.min(...repairedPath.map(point => point.y))).toBeGreaterThanOrEqual(-124);
    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
    )).toBeLessThan(scoreNodeClearanceRisk(
      pathFor(edges[0]),
      nodes,
      edges[0],
      COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
    ));
    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });

  it('prefers a lower-bend outer-lane escape over an equal-risk local clearance dogleg', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 838, y: 534 }, data: {}, measured: { width: 298, height: 118 } },
      { id: 'wcs', position: { x: 32, y: 1090 }, data: {}, measured: { width: 298, height: 118 } },
      { id: 'target', position: { x: 1286, y: 1540 }, data: {}, measured: { width: 296, height: 118 } },
    ];
    const edges: Edge[] = [{
      id: 'outer-branch',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'left',
      data: { computedPath: [
        { x: 987, y: 652 },
        { x: 987, y: 742 },
        { x: 0, y: 742 },
        { x: 0, y: 1599 },
        { x: 1286, y: 1599 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes, {
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    });
    const repairedPath = pathFor(repaired[0]);

    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
    expect(repairedPath.length, JSON.stringify(repairedPath)).toBeLessThanOrEqual(7);
    expect(Math.min(...repairedPath.map(point => point.x)))
      .toBeLessThanOrEqual(32 - COMMERCIAL_BUSINESS_NODE_CLEARANCE);
  });

  it('moves an adjacent corner with its branch instead of leaving a tiny rejoin stub', () => {
    const nodes: Node[] = [
      { id: 'target', position: { x: 148.2, y: 1613 }, data: {}, measured: { width: 331.997, height: 157.995 } },
      { id: 'blocker', position: { x: 142.161, y: 2171 }, data: {}, measured: { width: 335.998, height: 157.995 } },
      { id: 'source', position: { x: 115.161, y: 2489 }, data: {}, measured: { width: 390, height: 157.995 } },
    ];
    const edges: Edge[] = [{
      id: 'reverse-branch',
      source: 'source',
      target: 'target',
      data: { computedPath: [
        { x: 139, y: 2489 },
        { x: 139, y: 2148 },
        { x: 296, y: 2148 },
        { x: 296, y: 1771 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes, { minimumClearance: 16 });
    const repairedPath = pathFor(repaired[0]);

    expect(scoreNodeClearanceRisk(repairedPath, nodes, repaired[0], 16)).toBe(0);
    expect(repairedPath.some((point, index) => (
      index > 0
      && Math.abs(point.x - repairedPath[index - 1].x)
        + Math.abs(point.y - repairedPath[index - 1].y) < 16
    ))).toBe(false);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });

  it('uses a widened local detour when shifting the full lane would shorten a target stub', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 1000, y: 812 }, data: {}, measured: { width: 130, height: 100 } },
      { id: 'blocker', position: { x: 972, y: 540 }, data: {}, measured: { width: 259, height: 118 } },
      { id: 'target', position: { x: 1320.1125, y: 100 }, data: {}, measured: { width: 220, height: 86 } },
    ];
    const edges: Edge[] = [{
      id: 'reverse-branch',
      source: 'source',
      target: 'target',
      sourceHandle: 'top',
      targetHandle: 'left',
      data: { computedPath: [
        { x: 1064.75, y: 812 },
        { x: 1064.75, y: 756 },
        { x: 1088.75, y: 756 },
        { x: 1088.75, y: 719 },
        { x: 1264.1125, y: 719 },
        { x: 1264.1125, y: 143 },
        { x: 1320.1125, y: 143 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes, {
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      validateCandidate: ({ candidateEdges }) => {
        const candidatePath = pathFor(candidateEdges[0]);
        const endpoint = candidatePath.at(-1);
        const adjacent = candidatePath.at(-2);
        return Boolean(
          endpoint
          && adjacent
          && endpoint.x - adjacent.x >= COMMERCIAL_BUSINESS_NODE_CLEARANCE
          && calculateEdgePathQualityScore(candidateEdges).tinyInteriorDoglegs === 0
        );
      },
    });
    const repairedPath = pathFor(repaired[0]);
    const endpoint = repairedPath.at(-1);
    const adjacent = repairedPath.at(-2);

    expect(scoreNodeClearanceRisk(
      pathFor(edges[0]),
      nodes,
      edges[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBeGreaterThan(0);
    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
    expect(repairedPath.length).toBeGreaterThan(pathFor(edges[0]).length);
    expect((endpoint?.x ?? 0) - (adjacent?.x ?? 0)).toBeGreaterThanOrEqual(
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    );
    expect(calculateEdgePathQualityScore(repaired).tinyInteriorDoglegs).toBe(0);
  });

  it('leaves malformed and already-clear paths unchanged', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'target', position: { x: 300, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
    ];
    const edges: Edge[] = [
      { id: 'clear', source: 'source', target: 'target', data: { computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }] } },
      { id: 'invalid', source: 'source', target: 'target', data: { computedPath: [{ x: Number.NaN, y: 30 }] } },
    ];

    expect(repairBusinessNodeClearanceRisks(edges, nodes)).toEqual(edges);
  });

  it('escapes a boundary-aligned blocker after an endpoint stub', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 600, y: 60 }, data: {}, measured: { width: 80, height: 80 } },
      { id: 'blocker', position: { x: 0, y: 90 }, data: {}, measured: { width: 200, height: 200 } },
      { id: 'target', position: { x: 800, y: -60 }, data: {}, measured: { width: 80, height: 80 } },
    ];
    const edges: Edge[] = [{
      id: 'boundary-corner',
      source: 'source',
      target: 'target',
      sourceHandle: 'left',
      targetHandle: 'left',
      data: { computedPath: [
        { x: 600, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
        { x: 800, y: 0 },
      ] },
    }];

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes, {
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    });
    const repairedPath = pathFor(repaired[0]);

    expect(repaired).not.toBe(edges);
    expect(repairedPath[0]).toEqual({ x: 600, y: 100 });
    expect(repairedPath[1]?.x).toBeLessThanOrEqual(552);
    expect(scoreNodeClearanceRisk(
      repairedPath,
      nodes,
      repaired[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
  });

  it('does not commit a branch detour rejected by the owning trunk transaction', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'blocker', position: { x: 220, y: 70 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'target', position: { x: 400, y: 70 }, data: {}, measured: { width: 80, height: 60 } },
    ];
    const edges: Edge[] = [{
      id: 'branch',
      source: 'source',
      target: 'target',
      data: { computedPath: [
        { x: 80, y: 30 },
        { x: 140, y: 30 },
        { x: 140, y: 100 },
        { x: 400, y: 100 },
      ] },
    }];
    let validationCalls = 0;

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes, {
      validateCandidate: () => {
        validationCalls += 1;
        return false;
      },
    });

    expect(validationCalls).toBeGreaterThan(0);
    expect(repaired).toBe(edges);
  });
});
