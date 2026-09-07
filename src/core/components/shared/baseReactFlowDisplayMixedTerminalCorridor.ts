import type { Edge, Node } from '@xyflow/react';

import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  auditBaseReactFlowDisplayCommercialQuality,
  MAX_COMMERCIAL_BEND_COUNT,
  MIN_COMMERCIAL_INTERIOR_SEGMENT,
} from './baseReactFlowDisplayCommercialQuality';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import { getNodeRect } from './baseReactFlowDisplayEdgeGeometry';
import { displayPathLength, withDisplayComputedPath } from './baseReactFlowDisplayGeometry';

const pathSignature = (path: Array<{ x: number; y: number }>): string => (
  path.map(point => `${point.x}:${point.y}`).join('|')
);

const isStrictlyBetween = (value: number, first: number, second: number): boolean => (
  value > Math.min(first, second) && value < Math.max(first, second)
);

/** Mixed-axis terminals need two corridor axes: a single exterior lane can
 * clear the middle obstacle yet graze a node near the target. Join the two
 * lanes at existing obstacle clearance boundaries, retaining both stubs.
 * The terminal-shortcut entry validates the path and supplies its search policy. */
export const buildMixedTerminalCorridorShortcutPaths = (
  path: Array<{ x: number; y: number }>,
  nodes: Node[],
  edge: Edge,
  policy: { maxCandidates: number; containerNodeTypes: ReadonlySet<string> },
): Array<Array<{ x: number; y: number }>> => {
  if (path.length - 2 <= MAX_COMMERCIAL_BEND_COUNT) return [];
  const transpose = path[0].y === path[1].y;
  const orient = (point: { x: number; y: number }): { x: number; y: number } => (
    transpose ? { x: point.y, y: point.x } : point
  );
  const oriented = path.map(orient);
  const source = oriented[0];
  const sourceStub = oriented[1];
  const targetStub = oriented[oriented.length - 2];
  const target = oriented[oriented.length - 1];
  if (source.x !== sourceStub.x || targetStub.y !== target.y
    || source.y === sourceStub.y || targetStub.x === target.x) return [];
  const laneCoordinates = new Set([
    targetStub.x - MIN_COMMERCIAL_INTERIOR_SEGMENT,
    targetStub.x + MIN_COMMERCIAL_INTERIOR_SEGMENT,
  ]);
  const joinCoordinates = new Set<number>();
  for (const point of oriented.slice(2, -2)) {
    laneCoordinates.add(point.x);
    joinCoordinates.add(point.y);
  }
  const byId = new Map(nodes.map(node => [node.id, node] as const));
  if (!byId.has(edge.source) || !byId.has(edge.target)) return [];
  const businessNodes = nodes.filter(node => !node.hidden && !policy.containerNodeTypes.has(node.type ?? ''));
  for (const node of businessNodes) {
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) return [];
    if ([node.width, node.height, node.measured?.width, node.measured?.height]
      .some(value => value !== undefined && (!Number.isFinite(value) || value <= 0))) return [];
    if (node.id === edge.source || node.id === edge.target) continue;
    const rect = getNodeRect(node, byId);
    if (!rect) continue;
    const start = orient(rect);
    const end = orient({ x: rect.x + rect.width, y: rect.y + rect.height });
    if (![start.x, start.y, end.x, end.y].every(value => Number.isFinite(value)
      && Math.abs(value) <= 1_000_000)) return [];
    if (end.y + COMMERCIAL_BUSINESS_NODE_CLEARANCE < Math.min(sourceStub.y, targetStub.y)
      || start.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE > Math.max(sourceStub.y, targetStub.y)) continue;
    laneCoordinates.add(start.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE);
    laneCoordinates.add(end.x + COMMERCIAL_BUSINESS_NODE_CLEARANCE);
    joinCoordinates.add(start.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE);
    joinCoordinates.add(end.y + COMMERCIAL_BUSINESS_NODE_CLEARANCE);
  }
  const lanes = [...laneCoordinates].sort((a, b) => (
    Math.abs(a - targetStub.x) - Math.abs(b - targetStub.x) || a - b
  )).slice(0, 8);
  const joins = [...joinCoordinates]
    .filter(value => isStrictlyBetween(value, sourceStub.y, targetStub.y))
    .sort((a, b) => Math.abs(a - targetStub.y) - Math.abs(b - targetStub.y) || a - b)
    .slice(0, 16);
  const baselineLength = displayPathLength(path);
  const baselineRisk = scoreNodeClearanceRisk(path, businessNodes, edge, COMMERCIAL_BUSINESS_NODE_CLEARANCE);
  const candidates: Array<Array<{ x: number; y: number }>> = [];
  const seen = new Set<string>();
  for (const lane of lanes) for (const join of joins) {
    const candidate = compactOrthogonalPath([
      source, sourceStub, { x: lane, y: sourceStub.y }, { x: lane, y: join },
      { x: targetStub.x, y: join }, targetStub, target,
    ].map(orient));
    if (candidate.some(point => Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000)) continue;
    if (candidate.length >= path.length || displayPathLength(candidate) > baselineLength + 0.5) continue;
    const candidateEdge = withDisplayComputedPath(edge, candidate);
    if (auditBaseReactFlowDisplayCommercialQuality([candidateEdge]).length > 0
      || scoreNodeClearanceRisk(candidate, businessNodes, candidateEdge, COMMERCIAL_BUSINESS_NODE_CLEARANCE) > baselineRisk) continue;
    const signature = pathSignature(candidate);
    if (seen.has(signature)) continue;
    seen.add(signature);
    candidates.push(candidate);
  }
  return candidates.sort((a, b) => a.length - b.length
    || displayPathLength(a) - displayPathLength(b)
    || a.reduce((difference, point, index) => difference || point.x - b[index].x || point.y - b[index].y, 0))
    .slice(0, policy.maxCandidates);
};
