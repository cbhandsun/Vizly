import type { Edge, Node } from '@xyflow/react';

import {
  createNodeClearanceGraphEvaluationContext,
  type NodeClearanceGraphEvaluationContext,
} from '../../strategies/shared/edgeWaypointCandidateRepair';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  getDisplayComputedPath,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';

const SEGMENT_GRID_CELL_SIZE = 128;
const MAX_GRID_CELLS_PER_SEGMENT = 4_096;
const MAX_GRID_CELLS_PER_QUERY = 4_096;
const MAX_INDEXED_EDGES = 20_000;
const MAX_INDEXED_SEGMENTS = 200_000;

export type DisplayRoutingSegmentIndexMetrics = Readonly<{
  indexedSegmentCount: number;
  overflowEdgeCount: number;
  queryCount: number;
  scannedBucketCount: number;
  candidateEdgeCount: number;
}>;

export type DisplayRoutingSegmentSpatialIndex = Readonly<{
  outputRouteSignature: string;
  edgeCount: number;
  queryEdgeIds: (
    rectangles: readonly DisplayRect[],
    padding?: number,
  ) => ReadonlySet<string> | null;
  readMetrics: () => DisplayRoutingSegmentIndexMetrics;
}>;

export type DisplayRoutingWorkerSpatialSnapshot = Readonly<{
  outputRouteSignature: string;
  segmentIndex: DisplayRoutingSegmentSpatialIndex;
  nodeClearanceIndex: NodeClearanceGraphEvaluationContext;
}>;

const finiteRect = (rect: DisplayRect): boolean => (
  Number.isFinite(rect.x)
  && Number.isFinite(rect.y)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
  && rect.width >= 0
  && rect.height >= 0
);

const cellRange = (minimum: number, maximum: number): [number, number] => [
  Math.floor(minimum / SEGMENT_GRID_CELL_SIZE),
  Math.floor(maximum / SEGMENT_GRID_CELL_SIZE),
];

const cellCount = (
  minCellX: number,
  maxCellX: number,
  minCellY: number,
  maxCellY: number,
): number => (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);

const cellKey = (cellX: number, cellY: number): string => `${cellX},${cellY}`;

export const createDisplayRoutingSegmentSpatialIndex = (
  edges: readonly Edge[],
  expectedOutputRouteSignature?: string,
): DisplayRoutingSegmentSpatialIndex | null => {
  if (edges.length > MAX_INDEXED_EDGES) return null;
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature([...edges]);
  if (
    !outputRouteSignature
    || (
      expectedOutputRouteSignature !== undefined
      && outputRouteSignature !== expectedOutputRouteSignature
    )
  ) return null;

  const edgeIds = new Set<string>();
  const buckets = new Map<string, Set<string>>();
  const overflowEdgeIds = new Set<string>();
  let indexedSegmentCount = 0;
  for (const edge of edges) {
    if (!edge.id || edgeIds.has(edge.id)) return null;
    edgeIds.add(edge.id);
    const path = getDisplayComputedPath(edge);
    for (let index = 1; index < path.length; index += 1) {
      const first = path[index - 1];
      const second = path[index];
      if (
        !first
        || !second
        || !Number.isFinite(first.x)
        || !Number.isFinite(first.y)
        || !Number.isFinite(second.x)
        || !Number.isFinite(second.y)
      ) {
        overflowEdgeIds.add(edge.id);
        continue;
      }
      if (first.x === second.x && first.y === second.y) continue;
      indexedSegmentCount += 1;
      if (indexedSegmentCount > MAX_INDEXED_SEGMENTS) return null;
      const [minCellX, maxCellX] = cellRange(
        Math.min(first.x, second.x),
        Math.max(first.x, second.x),
      );
      const [minCellY, maxCellY] = cellRange(
        Math.min(first.y, second.y),
        Math.max(first.y, second.y),
      );
      if (
        !Number.isSafeInteger(minCellX)
        || !Number.isSafeInteger(maxCellX)
        || !Number.isSafeInteger(minCellY)
        || !Number.isSafeInteger(maxCellY)
        || cellCount(minCellX, maxCellX, minCellY, maxCellY) > MAX_GRID_CELLS_PER_SEGMENT
      ) {
        overflowEdgeIds.add(edge.id);
        continue;
      }
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const key = cellKey(cellX, cellY);
          const bucket = buckets.get(key);
          if (bucket) bucket.add(edge.id);
          else buckets.set(key, new Set([edge.id]));
        }
      }
    }
  }

  let queryCount = 0;
  let scannedBucketCount = 0;
  let candidateEdgeCount = 0;
  return Object.freeze({
    outputRouteSignature,
    edgeCount: edges.length,
    queryEdgeIds(rectangles, padding = 0) {
      if (!Number.isFinite(padding) || padding < 0) return null;
      queryCount += 1;
      const result = new Set(overflowEdgeIds);
      for (const rect of rectangles) {
        if (!finiteRect(rect)) return null;
        const [minCellX, maxCellX] = cellRange(
          rect.x - padding,
          rect.x + rect.width + padding,
        );
        const [minCellY, maxCellY] = cellRange(
          rect.y - padding,
          rect.y + rect.height + padding,
        );
        const queryCellCount = cellCount(minCellX, maxCellX, minCellY, maxCellY);
        if (!Number.isFinite(queryCellCount) || queryCellCount > MAX_GRID_CELLS_PER_QUERY) {
          return null;
        }
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
            scannedBucketCount += 1;
            for (const edgeId of buckets.get(cellKey(cellX, cellY)) ?? []) {
              result.add(edgeId);
            }
          }
        }
      }
      candidateEdgeCount += result.size;
      return result;
    },
    readMetrics: () => ({
      indexedSegmentCount,
      overflowEdgeCount: overflowEdgeIds.size,
      queryCount,
      scannedBucketCount,
      candidateEdgeCount,
    }),
  });
};

export const createDisplayRoutingWorkerSpatialSnapshot = ({
  nodes,
  edges,
  outputRouteSignature,
}: {
  nodes: Node[];
  edges: Edge[];
  outputRouteSignature: string;
}): DisplayRoutingWorkerSpatialSnapshot | null => {
  const segmentIndex = createDisplayRoutingSegmentSpatialIndex(
    edges,
    outputRouteSignature,
  );
  if (!segmentIndex) return null;
  return Object.freeze({
    outputRouteSignature,
    segmentIndex,
    nodeClearanceIndex: createNodeClearanceGraphEvaluationContext(nodes),
  });
};
