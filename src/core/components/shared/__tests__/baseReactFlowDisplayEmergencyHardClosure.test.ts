import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  countDisplayObstacleHits,
  displayHardQualityReportGeometryIsClean,
  type BaseDisplayBoundedCandidateReport,
} from '../baseReactFlowDisplayEvaluation';
import { buildBaseReactFlowEmergencyObstacleCandidate } from '../baseReactFlowDisplayEmergencyHardClosure';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { displayRenderedHardQualityGatesAreClean } from '../baseReactFlowDisplayQualityGates';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

const nodes: Node[] = [
  node('target', 100, 0, 100, 80),
  node('blocker', 120, 160, 60, 80),
  node('source', 100, 400, 100, 80),
];

const blockedEdge: Edge = {
  id: 'blocked',
  source: 'source',
  target: 'target',
  sourceHandle: 'top',
  targetHandle: 'bottom',
  data: {
    computedPath: [
      { x: 150, y: 400 },
      { x: 150, y: 80 },
    ],
  },
};

describe('emergency rendered-route hard closure', () => {
  it('atomically moves a same-axis route to an outer lane without reopening hard gates', () => {
    const baseline = [blockedEdge];
    expect(countDisplayObstacleHits(baseline, nodes)).toBeGreaterThan(0);
    const result = buildBaseReactFlowEmergencyObstacleCandidate(baseline, nodes);

    expect(result).not.toBe(baseline);
    expect(countDisplayObstacleHits(result, nodes)).toBe(0);
    expect(displayRenderedHardQualityGatesAreClean(result, nodes)).toBe(true);
    expect(getDisplayComputedPath(result[0])).toHaveLength(6);
  });

  it('preserves identity for empty, already-clean, and unsupported mixed-axis inputs', () => {
    const empty: Edge[] = [];
    expect(buildBaseReactFlowEmergencyObstacleCandidate(empty, nodes)).toBe(empty);

    const clean = [{
      ...blockedEdge,
      data: { computedPath: [{ x: 150, y: 400 }, { x: 60, y: 400 }, { x: 60, y: 80 }, { x: 150, y: 80 }] },
    }];
    expect(buildBaseReactFlowEmergencyObstacleCandidate(clean, nodes)).toBe(clean);

    const mixedAxis = [{
      ...blockedEdge,
      targetHandle: 'right',
      data: { computedPath: [{ x: 150, y: 400 }, { x: 150, y: 40 }, { x: 200, y: 40 }] },
    }];
    expect(buildBaseReactFlowEmergencyObstacleCandidate(mixedAxis, nodes)).toBe(mixedAxis);
  });

  it('keeps geometry evidence independent from lifecycle-specific terminal evidence', () => {
    const report: BaseDisplayBoundedCandidateReport = {
      candidate: 'polished',
      hardClean: false,
      obstacleHits: 0,
      terminalsAttached: true,
      terminalsAnchored: false,
      quality: {
        nonOrthogonalSegments: 0,
        strictCrossings: 0,
        reverseOverlap: 0,
        unrelatedOverlap: 0,
        relatedOverlap: 0,
        unexplainedRelatedOverlap: 0,
        shortEndpointStubs: 0,
        tinyInteriorDoglegs: 0,
        hairpins: 0,
        backtrackPenalty: 0,
        detourPenalty: 0,
        bends: 0,
        totalLength: 100,
      },
    };

    expect(displayHardQualityReportGeometryIsClean(report)).toBe(true);
    expect(displayHardQualityReportGeometryIsClean({ ...report, obstacleHits: 1 })).toBe(false);
    expect(displayHardQualityReportGeometryIsClean({
      ...report,
      quality: { ...report.quality, tinyInteriorDoglegs: 1 },
    })).toBe(false);
  });
});
