import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { buildBoundedResidualOverlapMazeCandidate } from '../../../strategies/shared/edgeDetachedResidualOverlapMaze';
import { repairExactThresholdResidualOverlaps } from '../baseReactFlowDisplayOverlapRepair';
import {
  collectExactThresholdResidualPairs,
  repairBoundedReverseParallelOverlapsWithCandidates,
  repairResidualOppositeInteriorLaneOverlaps,
} from '../baseReactFlowDisplayReverseParallelRepair';
import { createDisplayTerminalValidationSnapshot } from '../baseReactFlowTerminalValidation';
import { edgeNodeObstacleHits } from './baseReactFlowDisplayEdges.testUtils';

const edge = (id: string, source: string, target: string, computedPath: Array<{ x: number; y: number }>): Edge => ({
  id,
  source,
  target,
  data: { computedPath },
});

const node = (id: string, x: number, y: number, width = 100, height = 100): Node => ({
  id,
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

describe('baseReactFlowDisplayReverseParallelRepair', () => {
  it('collects exact residual pairs in descending overlap order', () => {
    const edges = [
      edge('long-forward', 'a', 'b', [{ x: 0, y: 0 }, { x: 120, y: 0 }]),
      edge('long-reverse', 'c', 'd', [{ x: 120, y: 0 }, { x: 0, y: 0 }]),
      edge('short-reverse', 'e', 'f', [{ x: 80, y: 20 }, { x: 20, y: 20 }]),
      edge('short-forward', 'g', 'h', [{ x: 20, y: 20 }, { x: 80, y: 20 }]),
    ];

    expect(collectExactThresholdResidualPairs(edges).map(pair => pair.overlap)).toEqual([120, 60]);
    expect(collectExactThresholdResidualPairs([])).toEqual([]);
  });

  it('accepts a bounded candidate only when reverse overlap improves', () => {
    const baseline = [
      edge('forward', 'a', 'b', [{ x: 0, y: 0 }, { x: 120, y: 0 }]),
      edge('reverse', 'c', 'd', [{ x: 120, y: 0 }, { x: 0, y: 0 }]),
    ];
    const separated = [
      baseline[0],
      edge('reverse', 'c', 'd', [{ x: 120, y: 24 }, { x: 0, y: 24 }]),
    ];

    const repaired = repairBoundedReverseParallelOverlapsWithCandidates(
      baseline,
      [],
      4,
      () => [separated],
    );

    expect(calculateEdgePathQualityScore(baseline).reverseOverlap).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(repaired).reverseOverlap).toBe(0);
  });

  it('slides a free terminal tangent to clear an exact 24px reverse overlap', () => {
    const nodes = [
      node('upper-source', 50, 0),
      node('lower-source', 50, 276),
      node('lower-target', -50, 500),
      node('upper-target', 150, -100),
    ];
    const baseline = [
      {
        ...edge('down', 'upper-source', 'lower-target', [
          { x: 100, y: 100 }, { x: 100, y: 200 },
          { x: 0, y: 200 }, { x: 0, y: 500 },
        ]),
        sourceHandle: 'bottom',
        targetHandle: 'top',
      },
      {
        ...edge('up', 'lower-source', 'upper-target', [
          { x: 100, y: 276 }, { x: 100, y: 176 },
          { x: 200, y: 176 }, { x: 200, y: 0 },
        ]),
        sourceHandle: 'top',
        targetHandle: 'bottom',
      },
    ];

    const baselineQuality = calculateEdgePathQualityScore(baseline);
    const baselineObstacles = edgeNodeObstacleHits(baseline, nodes).length;
    const repaired = repairExactThresholdResidualOverlaps(baseline, nodes);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
    const manualCandidate = [
      {
        ...baseline[0],
        data: {
          ...baseline[0].data,
          computedPath: [
            { x: 52, y: 100 }, { x: 52, y: 200 },
            { x: 0, y: 200 }, { x: 0, y: 500 },
          ],
        },
      },
      baseline[1],
    ];

    expect(baselineQuality.reverseOverlap).toBe(24);
    expect(repairedQuality.reverseOverlap, JSON.stringify({
      manualQuality: calculateEdgePathQualityScore(manualCandidate),
      manualTerminals: manualCandidate.map(candidate => terminalValidation.validateEdge(candidate)),
      manualObstacles: edgeNodeObstacleHits(manualCandidate, nodes),
    }, null, 2)).toBe(0);
    expect(repairedQuality.unrelatedOverlap).toBe(0);
    expect(edgeNodeObstacleHits(repaired, nodes).length).toBeLessThanOrEqual(baselineObstacles);
    const terminalReports = repaired.map(candidate => ({
      id: candidate.id,
      report: terminalValidation.validateEdge(candidate),
      path: (candidate.data as { computedPath: Array<{ x: number; y: number }> }).computedPath,
    }));
    expect(
      terminalReports.every(candidate => candidate.report.anchored),
      JSON.stringify(terminalReports, null, 2),
    ).toBe(true);
  });

  it('preserves exact source positions while repairing around fixed terminal anchors', () => {
    const nodes = [
      node('upper-source', 50, 0),
      node('lower-source', 50, 276),
      node('lower-target', 250, 500),
      node('upper-target', 150, -100),
    ];
    const baseline = [
      {
        ...edge('down-fixed', 'upper-source', 'lower-target', [
          { x: 100, y: 100 }, { x: 100, y: 200 },
          { x: 300, y: 200 }, { x: 300, y: 500 },
        ]),
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: {
          computedPath: [
            { x: 100, y: 100 }, { x: 100, y: 200 },
            { x: 300, y: 200 }, { x: 300, y: 500 },
          ],
          manualHandlePositions: ['source'],
        },
      },
      {
        ...edge('up-fixed', 'lower-source', 'upper-target', [
          { x: 100, y: 276 }, { x: 100, y: 176 },
          { x: 200, y: 176 }, { x: 200, y: 0 },
        ]),
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: {
          computedPath: [
            { x: 100, y: 276 }, { x: 100, y: 176 },
            { x: 200, y: 176 }, { x: 200, y: 0 },
          ],
          manualHandlePositions: ['source'],
        },
      },
    ];

    const repaired = repairExactThresholdResidualOverlaps(baseline, nodes);

    expect(repaired.map(candidate => (candidate.data as { computedPath: Array<{ x: number; y: number }> }).computedPath[0]))
      .toEqual([{ x: 100, y: 100 }, { x: 100, y: 276 }]);
  });

  it('moves a true source trunk as one transaction instead of splitting its members', () => {
    const nodes = [
      node('shared-source', 50, 0),
      node('fixed-source', 50, 276),
      node('first-target', -50, 500),
      node('second-target', -150, 500),
      node('fixed-target', 150, -100),
    ];
    const baseline = [
      {
        ...edge('shared-first', 'shared-source', 'first-target', [
          { x: 100, y: 100 }, { x: 100, y: 200 },
          { x: 0, y: 200 }, { x: 0, y: 500 },
        ]),
        sourceHandle: 'bottom',
        targetHandle: 'top',
      },
      {
        ...edge('shared-second', 'shared-source', 'second-target', [
          { x: 100, y: 100 }, { x: 100, y: 200 },
          { x: -100, y: 200 }, { x: -100, y: 500 },
        ]),
        sourceHandle: 'bottom',
        targetHandle: 'top',
      },
      {
        ...edge('fixed-opposite', 'fixed-source', 'fixed-target', [
          { x: 100, y: 276 }, { x: 100, y: 176 },
          { x: 200, y: 176 }, { x: 200, y: 0 },
        ]),
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: {
          computedPath: [
            { x: 100, y: 276 }, { x: 100, y: 176 },
            { x: 200, y: 176 }, { x: 200, y: 0 },
          ],
          manualHandlePositions: ['source'],
        },
      },
    ];

    const repaired = repairExactThresholdResidualOverlaps(baseline, nodes);
    const repairedPaths = repaired.map(candidate => (
      candidate.data as { computedPath: Array<{ x: number; y: number }> }
    ).computedPath);
    const sourceTrunks = auditFinalSameSideEndpointOrder(repaired, nodes).legalSharedTrunks;

    expect(calculateEdgePathQualityScore(baseline).reverseOverlap).toBe(48);
    expect(calculateEdgePathQualityScore(repaired).reverseOverlap).toBe(0);
    expect(repairedPaths[0][0].x).toBe(repairedPaths[1][0].x);
    expect(repairedPaths[0][0].x).not.toBe(100);
    expect(repairedPaths[2][0]).toEqual({ x: 100, y: 276 });
    expect(sourceTrunks.some(trunk => (
      trunk.role === 'source'
      && trunk.nodeId === 'shared-source'
      && ['shared-first', 'shared-second'].every(id => trunk.edgeIds.includes(id))
    ))).toBe(true);
  });

  it('does not trade an exact terminal overlap for a new strict crossing', () => {
    const nodes = [
      node('boundary-source', 1361, 1984),
      node('bottom-source', 1348, 1726, 176, 100),
      node('upper-target', 1150, -100),
      node('lower-target', 1287, 2700),
    ];
    const baseline = [
      {
        ...edge('boundary-turn', 'boundary-source', 'upper-target', [
          { x: 1361, y: 2034 }, { x: 1361, y: 1850 },
          { x: 1200, y: 1850 }, { x: 1200, y: 0 },
        ]),
        sourceHandle: 'left',
        targetHandle: 'bottom',
      },
      {
        ...edge('bottom-exit', 'bottom-source', 'lower-target', [
          { x: 1361, y: 1826 }, { x: 1361, y: 1874 },
          { x: 1337, y: 1874 }, { x: 1337, y: 2700 },
        ]),
        sourceHandle: 'bottom',
        targetHandle: 'top',
      },
      edge('outer-stub-blocker', 'missing-source', 'missing-target', [
        { x: 1325, y: 2000 }, { x: 1325, y: 2048 },
      ]),
    ];

    const baselineQuality = calculateEdgePathQualityScore(baseline);
    const repaired = repairExactThresholdResidualOverlaps(baseline, nodes);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const manualCandidate = [
      {
        ...baseline[0],
        data: {
          ...baseline[0].data,
          computedPath: [
            { x: 1361, y: 2058 }, { x: 1313, y: 2058 },
            { x: 1313, y: 1850 }, { x: 1200, y: 1850 }, { x: 1200, y: 0 },
          ],
        },
      },
      baseline[1],
      baseline[2],
    ];
    const validation = createDisplayTerminalValidationSnapshot(nodes);

    expect(baselineQuality.strictCrossings).toBe(0);
    expect(baselineQuality.reverseOverlap).toBe(24);
    expect(repairedQuality.reverseOverlap, JSON.stringify({
      manualQuality: calculateEdgePathQualityScore(manualCandidate),
      manualValidation: manualCandidate.map(candidate => validation.validateEdge(candidate)),
      manualObstacles: edgeNodeObstacleHits(manualCandidate, nodes),
    }, null, 2)).toBe(0);
    expect(repairedQuality.unrelatedOverlap).toBe(0);
    expect(repairedQuality.strictCrossings).toBe(0);
  });

  it('separates opposite interior turns after a strict-crossing closure', () => {
    const nodes = [
      node('master', 100, 587, 420, 158),
      node('fulfill', 148, 1613, 332, 158),
      node('inventory', 142, 2171, 336, 158),
      node('outbound', 115, 2489, 390, 158),
    ];
    const baseline = [
      edge('master-to-inventory', 'master', 'inventory', [
        { x: 310, y: 746 }, { x: 310, y: 842 },
        { x: 512, y: 842 }, { x: 512, y: 2040 },
        { x: 334, y: 2040 }, { x: 334, y: 2170 },
      ]),
      edge('fulfill-to-outbound', 'fulfill', 'outbound', [
        { x: 338, y: 1772 }, { x: 338, y: 2040 },
        { x: 490, y: 2040 }, { x: 490, y: 2347 },
        { x: 350, y: 2347 }, { x: 350, y: 2489 },
      ]),
    ];

    const repaired = repairResidualOppositeInteriorLaneOverlaps(baseline, nodes, 64);
    const baselineQuality = calculateEdgePathQualityScore(baseline);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const manuallyShifted = [
      baseline[0],
      edge('fulfill-to-outbound', 'fulfill', 'outbound', [
        { x: 338, y: 1772 }, { x: 338, y: 2064 },
        { x: 490, y: 2064 }, { x: 490, y: 2347 },
        { x: 350, y: 2347 }, { x: 350, y: 2489 },
      ]),
    ];
    const mazeCandidates = baseline.map((_, edgeIndex) => buildBoundedResidualOverlapMazeCandidate(
      baseline,
      nodes,
      edgeIndex,
      [edgeIndex === 0 ? 1 : 0],
      { gridPadding: 320, preserveTerminalCaps: false },
    ));

    expect(baselineQuality.reverseOverlap).toBe(152);
    expect(repairedQuality.reverseOverlap, JSON.stringify({
      pairs: collectExactThresholdResidualPairs(baseline),
      baselineQuality,
      manualQuality: calculateEdgePathQualityScore(manuallyShifted),
      mazeCandidates: mazeCandidates.map((path, index) => ({
        path,
        quality: path ? calculateEdgePathQualityScore(baseline.map((candidate, candidateIndex) => (
          candidateIndex === index ? edge(candidate.id, candidate.source, candidate.target, path) : candidate
        ))) : null,
        obstacleHits: path ? edgeNodeObstacleHits(baseline.map((candidate, candidateIndex) => (
          candidateIndex === index ? edge(candidate.id, candidate.source, candidate.target, path) : candidate
        )), nodes) : [],
      })),
      repaired,
    }, null, 2)).toBe(0);
    expect(repairedQuality.strictCrossings).toBe(0);
  });
});
