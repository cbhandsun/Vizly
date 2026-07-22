import type { Node } from '@xyflow/react';
import {
  getDisplayNodeRect,
  isDisplayContainerNode,
  rangesOverlapWithMargin,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

export const STRICT_OBSTACLE_SIDE_CLEARANCES = [16, 24, 32, 48, 64];

const uniqueFiniteCoordinates = (values: number[]): number[] => Array.from(
  new Set(values.map(value => Math.round(value * 1000) / 1000)),
).filter(value => Number.isFinite(value));

export const buildStrictObstacleSideBridgeXs = (
  nodes: Node[],
  fromY: number,
  toY: number,
): number[] => {
  const values: number[] = [];
  for (const node of nodes) {
    if (isDisplayContainerNode(node)) continue;
    const rect = getDisplayNodeRect(node);
    if (!rect || !rangesOverlapWithMargin(fromY, toY, rect.y, rect.y + rect.height, 8)) continue;
    for (const clearance of STRICT_OBSTACLE_SIDE_CLEARANCES) {
      values.push(rect.x - clearance, rect.x + rect.width + clearance);
    }
  }
  return uniqueFiniteCoordinates(values);
};

export const buildStrictObstacleSideBridgeYs = (
  nodes: Node[],
  fromX: number,
  toX: number,
): number[] => {
  const values: number[] = [];
  for (const node of nodes) {
    if (isDisplayContainerNode(node)) continue;
    const rect = getDisplayNodeRect(node);
    if (!rect || !rangesOverlapWithMargin(fromX, toX, rect.x, rect.x + rect.width, 8)) continue;
    for (const clearance of STRICT_OBSTACLE_SIDE_CLEARANCES) {
      values.push(rect.y - clearance, rect.y + rect.height + clearance);
    }
  }
  return uniqueFiniteCoordinates(values);
};

const buildInterSegmentLanes = (
  path: DisplayPoint[],
  segments: Array<Pick<DisplaySegment, 'axis' | 'a' | 'b'>>,
  axis: 'h' | 'v',
): number[] => {
  const start = path[0];
  const end = path[path.length - 1];
  if (!start || !end) return [];
  const pathStart = axis === 'v' ? start.y : start.x;
  const pathEnd = axis === 'v' ? end.y : end.x;
  const coordinates = Array.from(new Set(
    segments
      .filter(segment => segment.axis === axis)
      .filter(segment => rangesOverlapWithMargin(
        Math.min(pathStart, pathEnd),
        Math.max(pathStart, pathEnd),
        Math.min(axis === 'v' ? segment.a.y : segment.a.x, axis === 'v' ? segment.b.y : segment.b.x),
        Math.max(axis === 'v' ? segment.a.y : segment.a.x, axis === 'v' ? segment.b.y : segment.b.x),
        4,
      ))
      .map(segment => Math.round((axis === 'v' ? segment.a.x : segment.a.y) * 1000) / 1000),
  )).sort((first, second) => first - second);
  const lanes: number[] = [];
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const gap = coordinates[index + 1] - coordinates[index];
    if (gap >= 8 && gap <= 96) lanes.push((coordinates[index] + coordinates[index + 1]) / 2);
  }
  return lanes;
};

export const buildStrictInterSegmentLaneXs = (
  path: DisplayPoint[],
  segments: Array<Pick<DisplaySegment, 'axis' | 'a' | 'b'>>,
): number[] => (
  buildInterSegmentLanes(path, segments, 'v')
);

export const buildStrictInterSegmentLaneYs = (
  path: DisplayPoint[],
  segments: Array<Pick<DisplaySegment, 'axis' | 'a' | 'b'>>,
): number[] => (
  buildInterSegmentLanes(path, segments, 'h')
);
