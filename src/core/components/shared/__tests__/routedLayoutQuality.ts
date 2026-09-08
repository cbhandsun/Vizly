import type { Edge, Node } from '@xyflow/react';
import type { LaneRankDirection } from '../../../types/domainLaneRank';
import { RoutingCrossingScorer } from '../../../algorithms/routingCrossingScorer';
import { evaluateLayoutGeometry } from '../../../algorithms/layoutGeometryConstraints';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';

export type RoutedLayoutQuality = Readonly<{
  width: number;
  height: number;
  pathLength: number;
  bends: number;
  crossings: number;
  backwardTravel: number;
}>;

/** These are routed paths, never straight-line estimates between node centers.
 * Oversized/incomplete measurements are ineligible for optional optimization. */
export function measureRoutedLayoutQuality(
  nodes: Node[], edges: Edge[], direction: LaneRankDirection = 'TB',
): RoutedLayoutQuality | null {
  if (nodes.length === 0 || nodes.length > 128 || edges.length === 0 || edges.length > 128) return null;
  if (!evaluateLayoutGeometry(nodes).clean) return null;
  const projected = projectBaseReactFlowDisplayWorkerInput({ nodes, edges });
  const visible = projected.nodes.filter(node => !node.hidden);
  if (!visible.length) return null;
  const rectangles = visible.map(node => ({ x: node.positionAbsolute.x, y: node.positionAbsolute.y,
    width: node.measured?.width ?? node.width, height: node.measured?.height ?? node.height }));
  if (rectangles.some(rect => !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
    || typeof rect.width !== 'number' || !Number.isFinite(rect.width) || rect.width <= 0
    || typeof rect.height !== 'number' || !Number.isFinite(rect.height) || rect.height <= 0)) return null;
  const paths = new Map<string, ReturnType<typeof getDisplayComputedPath>>();
  let minX = Math.min(...rectangles.map(rect => rect.x)), minY = Math.min(...rectangles.map(rect => rect.y));
  let maxX = Math.max(...rectangles.map(rect => rect.x + (rect.width ?? 0)));
  let maxY = Math.max(...rectangles.map(rect => rect.y + (rect.height ?? 0)));
  let pathLength = 0, segments = 0, backwardTravel = 0;
  const horizontal = direction === 'LR' || direction === 'RL';
  const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
  for (const edge of edges) {
    if (edge.hidden) continue;
    if (paths.has(edge.id)) return null;
    const path = getDisplayComputedPath(edge);
    if (path.length < 2 || path.length > 128) return null;
    segments += path.length - 1;
    if (segments > 1024) return null;
    for (let index = 0; index < path.length; index++) {
      const point = path[index];
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
        || Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000) return null;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      if (index === 0) continue;
      const previous = path[index - 1];
      const dx = Math.abs(point.x - previous.x), dy = Math.abs(point.y - previous.y);
      if (dx > 0.01 && dy > 0.01) return null;
      pathLength += Math.hypot(dx, dy);
      backwardTravel += Math.max(0, -sign * (horizontal ? point.x - previous.x : point.y - previous.y));
    }
    paths.set(edge.id, path);
  }
  if (!paths.size) return null;
  const scored = new RoutingCrossingScorer().score(paths);
  return {
    width: maxX - minX, height: maxY - minY,
    pathLength, backwardTravel, bends: scored.bends, crossings: scored.hardCrossings + scored.buddyCrossings,
  };
}

/** Strict improvement without sacrificing any measured readability dimension.
 * Keep the baseline on ties, incomplete evidence, or conflicting objectives. */
export function routedLayoutDominates(baseline: RoutedLayoutQuality | null, candidate: RoutedLayoutQuality | null): boolean {
  if (!baseline || !candidate) return false;
  const fields = ['width', 'height', 'pathLength', 'bends', 'crossings', 'backwardTravel'] as const;
  if (fields.some(key => !Number.isFinite(baseline[key]) || !Number.isFinite(candidate[key])
    || baseline[key] < 0 || candidate[key] < 0)) return false;
  return fields.every(key => candidate[key] <= baseline[key] + 0.01)
    && fields.some(key => candidate[key] < baseline[key] - 0.01);
}
