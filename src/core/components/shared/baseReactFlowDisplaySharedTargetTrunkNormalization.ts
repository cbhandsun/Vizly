import type { Edge } from '@xyflow/react';

import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';

const POINT_EPSILON = 1;
const MIN_INTERIOR_SEGMENT = 24;
const HAIRPIN_SAFE_BRIDGE = 160;
const AXIS_CLEARANCES = [24, 32, 40, 48, 64] as const;

const samePoint = (first: DisplayPoint, second: DisplayPoint): boolean => (
  Math.abs(first.x - second.x) <= POINT_EPSILON
  && Math.abs(first.y - second.y) <= POINT_EPSILON
);

const commonSuffixLength = (first: DisplayPoint[], second: DisplayPoint[]): number => {
  const limit = Math.min(first.length, second.length);
  let length = 0;
  while (
    length < limit
    && samePoint(first[first.length - 1 - length], second[second.length - 1 - length])
  ) length += 1;
  return length;
};

const pathKey = (edges: Edge[]): string => edges.map(edge => (
  `${edge.id}:${getDisplayComputedPath(edge).map(point => `${point.x}:${point.y}`).join('|')}`
)).join('::');

/**
 * Widens a tiny branch elbow by moving the complete shared target trunk as a
 * transaction. Every member that owns the same suffix is changed together,
 * so a real target trunk cannot be split by per-edge micro cleanup.
 */
export const buildSharedTargetTrunkNormalizationCandidates = <T extends Edge[]>(
  edges: T,
): T[] => {
  const candidates: T[] = [];
  const seen = new Set<string>();
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex += 1) {
    const first = edges[firstIndex];
    const firstPath = getDisplayComputedPath(first);
    if (!first || firstPath.length < 4) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex += 1) {
      const second = edges[secondIndex];
      const secondPath = getDisplayComputedPath(second);
      if (!second || first.target !== second.target || secondPath.length < 4) continue;
      const suffixLength = commonSuffixLength(firstPath, secondPath);
      if (suffixLength < 3) continue;
      const firstStartIndex = firstPath.length - suffixLength;
      const secondStartIndex = secondPath.length - suffixLength;
      const commonStart = firstPath[firstStartIndex];
      const commonEnd = firstPath[firstStartIndex + 1];
      const commonExit = firstPath[firstStartIndex + 2];
      const firstEntry = firstPath[firstStartIndex - 1];
      const secondEntry = secondPath[secondStartIndex - 1];
      const axis = displayAxisOf(commonStart, commonEnd);
      if (!commonStart || !commonEnd || !commonExit || !firstEntry || !secondEntry || !axis) continue;
      if (
        displayAxisOf(firstEntry, commonStart) === axis
        || displayAxisOf(secondEntry, commonStart) === axis
        || displayAxisOf(commonEnd, commonExit) === axis
      ) continue;

      for (const member of [
        { edgeIndex: firstIndex, path: firstPath, startIndex: firstStartIndex, entry: firstEntry },
        { edgeIndex: secondIndex, path: secondPath, startIndex: secondStartIndex, entry: secondEntry },
      ]) {
        const entryLength = axis === 'v'
          ? Math.abs(member.entry.x - commonStart.x)
          : Math.abs(member.entry.y - commonStart.y);
        const trunkLength = axis === 'v'
          ? Math.abs(commonEnd.y - commonStart.y)
          : Math.abs(commonEnd.x - commonStart.x);
        if (
          entryLength >= MIN_INTERIOR_SEGMENT
          || trunkLength < HAIRPIN_SAFE_BRIDGE + MIN_INTERIOR_SEGMENT
        ) continue;
        const trunkDirection = axis === 'v'
          ? Math.sign(commonEnd.y - commonStart.y)
          : Math.sign(commonEnd.x - commonStart.x);
        const entryCoordinate = axis === 'v' ? member.entry.x : member.entry.y;
        const trunkCoordinate = axis === 'v' ? commonStart.x : commonStart.y;
        const escapeDirection = Math.sign(entryCoordinate - trunkCoordinate) || -1;
        const escapeCoordinate = entryCoordinate + escapeDirection * MIN_INTERIOR_SEGMENT;
        const join = axis === 'v'
          ? { x: trunkCoordinate, y: commonStart.y + trunkDirection * HAIRPIN_SAFE_BRIDGE }
          : { x: commonStart.x + trunkDirection * HAIRPIN_SAFE_BRIDGE, y: trunkCoordinate };
        const escapeStart = axis === 'v'
          ? { x: escapeCoordinate, y: commonStart.y }
          : { x: commonStart.x, y: escapeCoordinate };
        const escapeEnd = axis === 'v'
          ? { x: escapeCoordinate, y: join.y }
          : { x: join.x, y: escapeCoordinate };
        const changedPath = compactOrthogonalPath([
          ...member.path.slice(0, member.startIndex),
          escapeStart,
          escapeEnd,
          join,
          ...member.path.slice(member.startIndex + 1),
        ]);
        const next = edges.map((edge, edgeIndex) => (
          edgeIndex === member.edgeIndex
            ? withDisplayComputedPath(edge, changedPath)
            : edge
        )) as T;
        const key = pathKey(next);
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(next);
        }
      }

      const entryCoordinates = axis === 'v'
        ? [firstEntry.x, secondEntry.x]
        : [firstEntry.y, secondEntry.y];
      const exitCoordinate = axis === 'v' ? commonExit.x : commonExit.y;
      const coordinateSeeds = [...entryCoordinates, exitCoordinate];
      const coordinates = [...new Set(coordinateSeeds.flatMap(coordinate => (
        AXIS_CLEARANCES.flatMap(clearance => [coordinate - clearance, coordinate + clearance])
      )))];

      for (const coordinate of coordinates) {
        if (
          entryCoordinates.some(entry => Math.abs(coordinate - entry) < MIN_INTERIOR_SEGMENT)
          || Math.abs(coordinate - exitCoordinate) < MIN_INTERIOR_SEGMENT
        ) continue;
        const next = edges.map((edge) => {
          if (edge.target !== first.target) return edge;
          const path = getDisplayComputedPath(edge);
          const edgeSuffixLength = commonSuffixLength(firstPath, path);
          if (edgeSuffixLength < suffixLength) return edge;
          const startIndex = path.length - suffixLength;
          const changedPath = path.map((point, pointIndex) => (
            pointIndex === startIndex || pointIndex === startIndex + 1
              ? axis === 'v' ? { x: coordinate, y: point.y } : { x: point.x, y: coordinate }
              : point
          ));
          return withDisplayComputedPath(edge, compactOrthogonalPath(changedPath));
        }) as T;
        const key = pathKey(next);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(next);
      }
    }
  }
  return candidates.slice(0, 32);
};
