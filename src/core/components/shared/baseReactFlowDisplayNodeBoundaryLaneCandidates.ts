import type { Node } from '@xyflow/react';

import { compactOrthogonalPath, isFinitePoint } from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  prioritizeLaneValues,
  sortedUniqueNumbers,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  buildStrictObstacleSideBridgeXs,
  buildStrictObstacleSideBridgeYs,
} from './baseReactFlowDisplayLaneCandidates';

type LaneAxis = 'h' | 'v';

type AdjacentSegmentSpec = {
  firstPointIndex: number;
  secondPointIndex: number;
  laneAxis: LaneAxis;
  fixedCrossingPointIndex: number;
};

const adjacentSegmentSpecs = (
  path: readonly DisplayPoint[],
  crossingSegmentIndex: number,
  crossingAxis: LaneAxis,
): AdjacentSegmentSpec[] => {
  const specs: AdjacentSegmentSpec[] = [];
  const previousFirst = path[crossingSegmentIndex - 1];
  const previousSecond = path[crossingSegmentIndex];
  if (
    previousFirst
    && previousSecond
    && displayAxisOf(previousFirst, previousSecond)
    && displayAxisOf(previousFirst, previousSecond) !== crossingAxis
  ) {
    specs.push({
      firstPointIndex: crossingSegmentIndex - 1,
      secondPointIndex: crossingSegmentIndex,
      laneAxis: crossingAxis === 'h' ? 'v' : 'h',
      fixedCrossingPointIndex: crossingSegmentIndex + 1,
    });
  }

  const nextFirst = path[crossingSegmentIndex + 1];
  const nextSecond = path[crossingSegmentIndex + 2];
  if (
    nextFirst
    && nextSecond
    && displayAxisOf(nextFirst, nextSecond)
    && displayAxisOf(nextFirst, nextSecond) !== crossingAxis
  ) {
    specs.push({
      firstPointIndex: crossingSegmentIndex + 1,
      secondPointIndex: crossingSegmentIndex + 2,
      laneAxis: crossingAxis === 'h' ? 'v' : 'h',
      fixedCrossingPointIndex: crossingSegmentIndex,
    });
  }

  return specs;
};

const exactPathSignature = (path: readonly DisplayPoint[]): string => (
  path.map(point => `${point.x},${point.y}`).join(';')
);

export const buildNodeBoundaryAdjacentLaneCandidates = (
  path: readonly DisplayPoint[],
  crossingSegmentIndex: number,
  crossingAxis: LaneAxis,
  nodes: Node[],
  competingCoordinate: number,
  fallbackLaneValues: readonly number[],
  maxLanesPerAdjacentSegment = 10,
): DisplayPoint[][] => {
  const candidates: DisplayPoint[][] = [];
  const seen = new Set<string>();

  for (const spec of adjacentSegmentSpecs(path, crossingSegmentIndex, crossingAxis)) {
    const first = path[spec.firstPointIndex];
    const second = path[spec.secondPointIndex];
    const fixedCrossingPoint = path[spec.fixedCrossingPointIndex];
    if (!first || !second || !fixedCrossingPoint) continue;
    const preferred = spec.laneAxis === 'v' ? first.x : first.y;
    const fixedCoordinate = spec.laneAxis === 'v'
      ? fixedCrossingPoint.x
      : fixedCrossingPoint.y;
    const remainsOnFixedSide = (laneValue: number): boolean => (
      fixedCoordinate < competingCoordinate
        ? laneValue < competingCoordinate
        : fixedCoordinate > competingCoordinate
          ? laneValue > competingCoordinate
          : true
    );
    const boundaryLanes = sortedUniqueNumbers(
      spec.laneAxis === 'v'
        ? buildStrictObstacleSideBridgeXs(nodes, first.y, second.y)
        : buildStrictObstacleSideBridgeYs(nodes, first.x, second.x),
      preferred,
    ).filter(remainsOnFixedSide).slice(0, 8);
    const fallbackLanes = sortedUniqueNumbers([...fallbackLaneValues], preferred)
      .filter(remainsOnFixedSide)
      .slice(0, 2);
    const laneValues = prioritizeLaneValues(
      preferred,
      boundaryLanes,
      fallbackLanes,
      maxLanesPerAdjacentSegment,
    );

    for (const laneValue of laneValues) {
      const shifted = path.map(point => ({ ...point }));
      if (spec.laneAxis === 'v') {
        shifted[spec.firstPointIndex].x = laneValue;
        shifted[spec.secondPointIndex].x = laneValue;
      } else {
        shifted[spec.firstPointIndex].y = laneValue;
        shifted[spec.secondPointIndex].y = laneValue;
      }
      const candidate = compactOrthogonalPath(shifted);
      if (candidate.length < 2 || !candidate.every(isFinitePoint)) continue;
      const signature = exactPathSignature(candidate);
      if (seen.has(signature)) continue;
      seen.add(signature);
      candidates.push(candidate);
    }
  }

  return candidates;
};
