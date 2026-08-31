import type { Edge } from '@xyflow/react';

import { isFinitePoint } from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  getDisplayComputedPath,
  segmentDisplayLength,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';

const samePoint = (first: DisplayPoint, second: DisplayPoint): boolean => (
  first.x === second.x && first.y === second.y
);

/** Propose moving an exact shared terminal trunk together, never its endpoints.
 * The caller still owns whole-graph quality, clearance, port and trunk gates.
 */
export const buildSharedRenderSafeStubCandidate = <T extends Edge[]>(
  baseline: T,
  candidate: T,
  primaryIndex: number,
): T => {
  const primary = baseline[primaryIndex];
  const proposed = candidate[primaryIndex];
  if (!primary || !proposed || baseline.length !== candidate.length) return candidate;
  const originalPath = getDisplayComputedPath(primary);
  const proposedPath = getDisplayComputedPath(proposed);
  if (originalPath.length < 4 || proposedPath.length !== originalPath.length
    || !originalPath.every(isFinitePoint) || !proposedPath.every(isFinitePoint)) return candidate;
  let result = candidate;
  for (const role of ['source', 'target'] as const) {
    const original = role === 'source' ? originalPath : [...originalPath].reverse();
    const next = role === 'source' ? proposedPath : [...proposedPath].reverse();
    const axis = displayAxisOf(original[0], original[1]);
    if (!axis || !samePoint(original[0], next[0])
      || displayAxisOf(next[0], next[1]) !== axis
      || displayAxisOf(original[1], original[2]) !== (axis === 'h' ? 'v' : 'h')
      || displayAxisOf(next[1], next[2]) !== (axis === 'h' ? 'v' : 'h')
      || segmentDisplayLength(next[0], next[1]) <= segmentDisplayLength(original[0], original[1])) continue;
    const coordinate = axis === 'h' ? 'x' : 'y';
    if (Math.sign(next[1][coordinate] - next[0][coordinate])
      !== Math.sign(original[1][coordinate] - original[0][coordinate])) continue;
    let changed = false;
    const extended = result.map((edge, index) => {
      const sibling = baseline[index];
      if (index === primaryIndex || sibling[role] !== primary[role]) return edge;
      const baselinePath = getDisplayComputedPath(sibling);
      const currentPath = getDisplayComputedPath(edge);
      if (baselinePath.length < 4 || currentPath.length !== baselinePath.length
        || !baselinePath.every(isFinitePoint) || !currentPath.every(isFinitePoint)) return edge;
      const shared = role === 'source' ? baselinePath : [...baselinePath].reverse();
      const sharedLength = segmentDisplayLength(shared[0], shared[1]);
      if (!samePoint(shared[0], original[0]) || displayAxisOf(shared[0], shared[1]) !== axis
        || Math.sign(shared[1][coordinate] - shared[0][coordinate])
          !== Math.sign(original[1][coordinate] - original[0][coordinate])
        || sharedLength < segmentDisplayLength(original[0], original[1])
        || sharedLength >= segmentDisplayLength(next[0], next[1])
        || displayAxisOf(shared[1], shared[2]) !== (axis === 'h' ? 'v' : 'h')) return edge;
      const path = currentPath.map(point => ({ ...point }));
      if (role === 'target') path.reverse();
      path[1][coordinate] = next[1][coordinate];
      path[2][coordinate] = next[1][coordinate];
      if (role === 'target') path.reverse();
      changed = true;
      return withDisplayComputedPath(edge, path);
    }) as T;
    if (changed) result = extended;
  }
  return result;
};
