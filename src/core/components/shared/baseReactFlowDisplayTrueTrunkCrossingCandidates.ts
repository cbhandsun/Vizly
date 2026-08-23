import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  type DisplaySegment,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

type CrossingSegmentGroup = {
  segment: DisplaySegment;
  perpendicular: DisplaySegment[];
};

export const buildTrueTrunkCrossingSkirtCandidates = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[][] => {
  const groups = new Map<string, CrossingSegmentGroup>();
  const append = (segment: DisplaySegment, perpendicular: DisplaySegment): void => {
    const key = `${segment.edgeIndex}:${segment.segmentIndex}`;
    const group = groups.get(key);
    if (group) group.perpendicular.push(perpendicular);
    else groups.set(key, { segment, perpendicular: [perpendicular] });
  };
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    append(hit.a, hit.b);
    append(hit.b, hit.a);
  }

  const trueTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
  const candidates: Edge[][] = [];
  const gap = 12;
  for (const group of groups.values()) {
    if (group.perpendicular.length < 2 || candidates.length >= 8) continue;
    const movingEdge = edges[group.segment.edgeIndex];
    if (!movingEdge || (eligibleEdgeIds && !eligibleEdgeIds.has(movingEdge.id))) continue;
    const otherIndexes = [...new Set(group.perpendicular.map(segment => segment.edgeIndex))];
    const otherEdges = otherIndexes.flatMap(index => edges[index] ? [edges[index]] : []);
    if (otherEdges.length < 2) continue;
    const otherIds = otherEdges.map(edge => edge.id);
    if (!trueTrunks.some(trunk => otherIds.every(edgeId => trunk.edgeIds.includes(edgeId)))) {
      continue;
    }

    const otherPoints = otherEdges.flatMap(getDisplayComputedPath);
    const otherSegments = extractDisplaySegments(otherEdges);
    if (otherPoints.length === 0) continue;
    const path = getDisplayComputedPath(movingEdge);
    const segment = group.segment;
    if (
      path.length < 3
      || segment.segmentIndex < 1
      || segment.segmentIndex >= path.length - 2
    ) continue;
    const before = path.slice(0, segment.segmentIndex + 1);
    const reconnectIndex = segment.segmentIndex + 2;
    const reconnect = path[reconnectIndex];
    const after = path.slice(reconnectIndex);
    if (!reconnect) continue;
    const detours = segment.axis === 'h'
      ? [
        Math.min(...group.perpendicular.flatMap(item => [item.a.y, item.b.y])) - gap,
        Math.max(...group.perpendicular.flatMap(item => [item.a.y, item.b.y])) + gap,
      ].map(laneY => {
        const lowY = Math.min(laneY, reconnect.y);
        const highY = Math.max(laneY, reconnect.y);
        const localHorizontal = otherSegments.filter(item => (
          item.axis === 'h' && item.a.y >= lowY && item.a.y <= highY
        ));
        const localX = localHorizontal.flatMap(item => [item.a.x, item.b.x]);
        const exitX = segment.b.x >= segment.a.x
          ? Math.max(...localX, ...group.perpendicular.map(item => item.a.x)) + gap
          : Math.min(...localX, ...group.perpendicular.map(item => item.a.x)) - gap;
        return compactOrthogonalPath([
          ...before,
          { x: segment.a.x, y: laneY },
          { x: exitX, y: laneY },
          { x: exitX, y: reconnect.y },
          ...after,
        ]);
      })
      : [
        Math.min(...group.perpendicular.flatMap(item => [item.a.x, item.b.x])) - gap,
        Math.max(...group.perpendicular.flatMap(item => [item.a.x, item.b.x])) + gap,
      ].map(laneX => {
        const lowX = Math.min(laneX, reconnect.x);
        const highX = Math.max(laneX, reconnect.x);
        const localVertical = otherSegments.filter(item => (
          item.axis === 'v' && item.a.x >= lowX && item.a.x <= highX
        ));
        const localY = localVertical.flatMap(item => [item.a.y, item.b.y]);
        const exitY = segment.b.y >= segment.a.y
          ? Math.max(...localY, ...group.perpendicular.map(item => item.a.y)) + gap
          : Math.min(...localY, ...group.perpendicular.map(item => item.a.y)) - gap;
        return compactOrthogonalPath([
          ...before,
          { x: laneX, y: segment.a.y },
          { x: laneX, y: exitY },
          { x: reconnect.x, y: exitY },
          ...after,
        ]);
      });
    for (const detour of detours) {
      candidates.push(edges.map((edge, index) => (
        index === segment.edgeIndex ? withDisplayComputedPath(edge, detour) : edge
      )));
    }
  }
  return candidates;
};
