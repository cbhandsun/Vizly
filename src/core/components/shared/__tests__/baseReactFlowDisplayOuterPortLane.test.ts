import type { Edge, Node } from '@xyflow/react';
import { expect, it } from 'vitest';

import {
  displaySegmentsForPath,
  getDisplayComputedPath,
} from '../baseReactFlowDisplayGeometry';
import { buildBoundedOuterPortTransactionCandidates } from '../baseReactFlowDisplayOuterPortCandidates';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const node = (id: string, x: number, y: number): Node => ({
  id,
  position: { x, y },
  width: 80,
  height: 40,
  measured: { width: 80, height: 40 },
  data: {},
});

it('derives a hard-clean transition lane from an adjacent fixed segment', () => {
  const nodes: Node[] = [
    node('fixed-source', 500, 400),
    node('fixed-target', 0, 600),
    node('moving-source', 800, 400),
    node('moving-target', 400, 450),
  ];
  const edges: Edge[] = [
    {
      id: 'fixed',
      source: 'fixed-source',
      target: 'fixed-target',
      sourceHandle: 'top',
      targetHandle: 'top',
      data: { computedPath: [
        { x: 540, y: 400 },
        { x: 540, y: 352 },
        { x: 564, y: 352 },
        { x: 564, y: 552 },
        { x: 40, y: 552 },
        { x: 40, y: 600 },
      ] },
    },
    {
      id: 'moving',
      source: 'moving-source',
      target: 'moving-target',
      sourceHandle: 'top',
      targetHandle: 'right',
      data: { computedPath: [
        { x: 840, y: 400 },
        { x: 840, y: 352 },
        { x: 565, y: 352 },
        { x: 565, y: 470 },
        { x: 480, y: 470 },
      ] },
    },
  ];
  const candidates = buildBoundedOuterPortTransactionCandidates(edges, nodes, {
    maxCandidates: 64,
  });
  const hasAdjacentLaneHardCleanCandidate = candidates.some(candidate => {
    if (!getDisplayHardQualityGateReport(candidate.edges, nodes, 'polished').hardClean) return false;
    const fixedIndex = candidate.movingEdgeIndex === 0 ? 1 : 0;
    const fixedSegments = displaySegmentsForPath(
      getDisplayComputedPath(candidate.edges[fixedIndex]),
      fixedIndex,
    );
    if (candidate.ringAxis === 'x') {
      const derivedFromHorizontalLane = fixedSegments.some(segment => segment.axis === 'h' && [
        segment.a.y - 48,
        segment.a.y - 24,
        segment.a.y + 24,
        segment.a.y + 48,
      ].some(lane => Math.abs(lane - candidate.transitionLane) < 0.5));
      const availableFromOldRangeBoundary = fixedSegments.some(segment => segment.axis === 'v' && [
        Math.min(segment.a.y, segment.b.y) - 48,
        Math.max(segment.a.y, segment.b.y) + 48,
      ].some(lane => Math.abs(lane - candidate.transitionLane) < 0.5));
      return derivedFromHorizontalLane && !availableFromOldRangeBoundary;
    }
    const derivedFromVerticalLane = fixedSegments.some(segment => segment.axis === 'v' && [
      segment.a.x - 48,
      segment.a.x - 24,
      segment.a.x + 24,
      segment.a.x + 48,
    ].some(lane => Math.abs(lane - candidate.transitionLane) < 0.5));
    const availableFromOldRangeBoundary = fixedSegments.some(segment => segment.axis === 'h' && [
      Math.min(segment.a.x, segment.b.x) - 48,
      Math.max(segment.a.x, segment.b.x) + 48,
    ].some(lane => Math.abs(lane - candidate.transitionLane) < 0.5));
    return derivedFromVerticalLane && !availableFromOldRangeBoundary;
  });

  expect(candidates.length).toBeGreaterThan(0);
  expect(hasAdjacentLaneHardCleanCandidate).toBe(true);
});
