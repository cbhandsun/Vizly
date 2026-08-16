import type { Edge, Node, XYPosition } from '@xyflow/react';

import { isFinitePoint } from './baseReactFlowDisplayCache';
import { fastDisplayHardSafetyIsClean } from './baseReactFlowFastEdgeSafety';

export const computedEndpointPathOf = (edge: Edge): XYPosition[] => {
  const path = ((edge.data || {}) as Record<string, unknown>).computedPath;
  return Array.isArray(path) && path.every(isFinitePoint) ? path : [];
};

const pathsStrictlyCross = (first: XYPosition[], second: XYPosition[]): boolean => {
  const tolerance = 0.5;
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[firstIndex + 1];
    const firstVertical = Math.abs(firstStart.x - firstEnd.x) <= tolerance;
    const firstHorizontal = Math.abs(firstStart.y - firstEnd.y) <= tolerance;
    if (!firstVertical && !firstHorizontal) continue;
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[secondIndex + 1];
      const secondVertical = Math.abs(secondStart.x - secondEnd.x) <= tolerance;
      const secondHorizontal = Math.abs(secondStart.y - secondEnd.y) <= tolerance;
      if (firstHorizontal && secondVertical) {
        const minX = Math.min(firstStart.x, firstEnd.x) + tolerance;
        const maxX = Math.max(firstStart.x, firstEnd.x) - tolerance;
        const minY = Math.min(secondStart.y, secondEnd.y) + tolerance;
        const maxY = Math.max(secondStart.y, secondEnd.y) - tolerance;
        if (secondStart.x > minX && secondStart.x < maxX && firstStart.y > minY && firstStart.y < maxY) {
          return true;
        }
      } else if (firstVertical && secondHorizontal) {
        const minX = Math.min(secondStart.x, secondEnd.x) + tolerance;
        const maxX = Math.max(secondStart.x, secondEnd.x) - tolerance;
        const minY = Math.min(firstStart.y, firstEnd.y) + tolerance;
        const maxY = Math.max(firstStart.y, firstEnd.y) - tolerance;
        if (firstStart.x > minX && firstStart.x < maxX && secondStart.y > minY && secondStart.y < maxY) {
          return true;
        }
      }
    }
  }
  return false;
};

const collinearPathOverlapLength = (first: XYPosition[], second: XYPosition[]): number => {
  const tolerance = 0.5;
  let overlap = 0;
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[firstIndex + 1];
    const firstVertical = Math.abs(firstStart.x - firstEnd.x) <= tolerance;
    const firstHorizontal = Math.abs(firstStart.y - firstEnd.y) <= tolerance;
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[secondIndex + 1];
      const secondVertical = Math.abs(secondStart.x - secondEnd.x) <= tolerance;
      const secondHorizontal = Math.abs(secondStart.y - secondEnd.y) <= tolerance;
      if (firstHorizontal && secondHorizontal && Math.abs(firstStart.y - secondStart.y) <= tolerance) {
        overlap += Math.max(
          0,
          Math.min(Math.max(firstStart.x, firstEnd.x), Math.max(secondStart.x, secondEnd.x))
            - Math.max(Math.min(firstStart.x, firstEnd.x), Math.min(secondStart.x, secondEnd.x)),
        );
      } else if (firstVertical && secondVertical && Math.abs(firstStart.x - secondStart.x) <= tolerance) {
        overlap += Math.max(
          0,
          Math.min(Math.max(firstStart.y, firstEnd.y), Math.max(secondStart.y, secondEnd.y))
            - Math.max(Math.min(firstStart.y, firstEnd.y), Math.min(secondStart.y, secondEnd.y)),
        );
      }
    }
  }
  return overlap;
};

const reverseCollinearPathOverlapLength = (first: XYPosition[], second: XYPosition[]): number => {
  const tolerance = 0.5;
  let overlap = 0;
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[firstIndex + 1];
    const firstVertical = Math.abs(firstStart.x - firstEnd.x) <= tolerance;
    const firstHorizontal = Math.abs(firstStart.y - firstEnd.y) <= tolerance;
    const firstDirection = firstVertical
      ? Math.sign(firstEnd.y - firstStart.y)
      : firstHorizontal ? Math.sign(firstEnd.x - firstStart.x) : 0;
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[secondIndex + 1];
      const secondVertical = Math.abs(secondStart.x - secondEnd.x) <= tolerance;
      const secondHorizontal = Math.abs(secondStart.y - secondEnd.y) <= tolerance;
      const secondDirection = secondVertical
        ? Math.sign(secondEnd.y - secondStart.y)
        : secondHorizontal ? Math.sign(secondEnd.x - secondStart.x) : 0;
      if (!firstDirection || firstDirection !== -secondDirection) continue;
      if (firstHorizontal && secondHorizontal && Math.abs(firstStart.y - secondStart.y) <= tolerance) {
        overlap += Math.max(
          0,
          Math.min(Math.max(firstStart.x, firstEnd.x), Math.max(secondStart.x, secondEnd.x))
            - Math.max(Math.min(firstStart.x, firstEnd.x), Math.min(secondStart.x, secondEnd.x)),
        );
      } else if (firstVertical && secondVertical && Math.abs(firstStart.x - secondStart.x) <= tolerance) {
        overlap += Math.max(
          0,
          Math.min(Math.max(firstStart.y, firstEnd.y), Math.max(secondStart.y, secondEnd.y))
            - Math.max(Math.min(firstStart.y, firstEnd.y), Math.min(secondStart.y, secondEnd.y)),
        );
      }
    }
  }
  return overlap;
};

export const displayEndpointCandidateDegradesGraph = ({
  candidate,
  original,
  edgeIndex,
  contextEdges,
  nodes,
}: {
  candidate: Edge;
  original: Edge;
  edgeIndex: number;
  contextEdges: Edge[];
  nodes: Node[];
}): boolean => {
  if (!fastDisplayHardSafetyIsClean([candidate], nodes)) return true;
  const originalPath = computedEndpointPathOf(original);
  const candidatePath = computedEndpointPathOf(candidate);
  if (candidatePath.length < 2) return true;
  return contextEdges.some((other, otherIndex) => {
    if (otherIndex === edgeIndex) return false;
    const otherPath = computedEndpointPathOf(other);
    if (pathsStrictlyCross(candidatePath, otherPath)) return true;
    const related = candidate.source === other.source
      || candidate.source === other.target
      || candidate.target === other.source
      || candidate.target === other.target;
    const overlap = related ? reverseCollinearPathOverlapLength : collinearPathOverlapLength;
    return overlap(candidatePath, otherPath) > overlap(originalPath, otherPath) + 0.5;
  });
};
