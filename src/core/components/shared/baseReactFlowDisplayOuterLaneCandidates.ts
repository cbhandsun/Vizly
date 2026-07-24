import type { Edge, Node } from '@xyflow/react';

import {
  streamDirectionalOuterLaneCandidateBatches,
  type DirectionalOuterLaneCandidateBatch,
} from './baseReactFlowDirectionalOuterLaneSearch';
import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  OBSTACLE_REPAIR_NODE_PADDING,
  prioritizeLaneValues,
  RESIDUAL_PARALLEL_LANE_GAP,
  segmentDisplayLength,
  sortedUniqueNumbers,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';

export const STRICT_OUTER_LANE_MIN_SPAN = 420;
export const STRICT_OUTER_LANE_MAX_REPAIRED_EDGES = 4;
export const STRICT_OUTER_LANE_MAX_CANDIDATES = 48;
export const STRICT_OUTER_LANE_STUB_LENGTHS = [96, 128, 64, 160, 224, 320, 384, 448, 512];

export const buildDirectionalStrictOuterLaneCandidates = (
  path: DisplayPoint[],
  nodes: Node[],
  edge: Edge,
): Iterable<DirectionalOuterLaneCandidateBatch<DisplayPoint[]>> => {
  if (path.length < 4) return [];
  const start = path[0];
  const end = path[path.length - 1];
  const startNext = path[1];
  const endPrevious = path[path.length - 2];
  const startAxis = displayAxisOf(start, startNext);
  const endAxis = displayAxisOf(endPrevious, end);
  if (!startAxis || !endAxis || startAxis !== endAxis) return [];

  const verticalSpan = Math.abs(start.y - end.y);
  const horizontalSpan = Math.abs(start.x - end.x);
  if (Math.max(verticalSpan, horizontalSpan) < STRICT_OUTER_LANE_MIN_SPAN) return [];

  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  if (obstacles.length === 0) return [];

  const minX = Math.min(...obstacles.map(rect => rect.x));
  const maxX = Math.max(...obstacles.map(rect => rect.x + rect.width));
  const minY = Math.min(...obstacles.map(rect => rect.y));
  const maxY = Math.max(...obstacles.map(rect => rect.y + rect.height));
  const laneGap = OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP;
  const currentStartStub = segmentDisplayLength(start, startNext);
  const currentEndStub = segmentDisplayLength(endPrevious, end);
  const sourceStubLengths = sortedUniqueNumbers(
    [
      ...STRICT_OUTER_LANE_STUB_LENGTHS,
      Math.min(Math.max(currentStartStub, 64), 640),
      Math.min(Math.max(currentStartStub + RESIDUAL_PARALLEL_LANE_GAP, 64), 640),
      Math.min(Math.max(currentStartStub - RESIDUAL_PARALLEL_LANE_GAP, 64), 640),
      Math.min(Math.max(currentStartStub + RESIDUAL_PARALLEL_LANE_GAP * 2, 64), 640),
      Math.min(Math.max(currentStartStub + RESIDUAL_PARALLEL_LANE_GAP * 3, 64), 640),
      Math.min(Math.max(currentStartStub + 96, 64), 640),
      Math.min(Math.max(currentStartStub + 128, 64), 640),
      Math.min(Math.max(currentStartStub + 160, 64), 640),
    ],
    STRICT_OUTER_LANE_STUB_LENGTHS[0],
  ).slice(0, 20);
  const targetStubLengths = sortedUniqueNumbers(
    [
      48,
      64,
      96,
      128,
      160,
      Math.min(Math.max(currentEndStub, 48), 320),
      Math.min(Math.max(currentEndStub + RESIDUAL_PARALLEL_LANE_GAP, 48), 320),
    ],
    64,
  ).slice(0, 6);
  const candidateKey = (candidate: DisplayPoint[]): string => (
    candidate.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|')
  );

  if (startAxis === 'v') {
    const sourceDirection = Math.sign(startNext.y - start.y) || Math.sign(end.y - start.y) || 1;
    const targetDirection = Math.sign(end.y - endPrevious.y) || Math.sign(end.y - start.y) || sourceDirection;
    const laneValues = prioritizeLaneValues(
      end.x,
      [
        minX - laneGap,
        minX - laneGap - 32,
        minX - laneGap - 64,
        minX - laneGap - 128,
        minX - laneGap - 224,
        maxX + laneGap,
        maxX + laneGap + 32,
        maxX + laneGap + 64,
        maxX + laneGap + 128,
        maxX + laneGap + 224,
      ],
      [
        end.x - 64,
        end.x + 64,
        end.x - 96,
        end.x + 96,
        end.x - 128,
        end.x + 128,
        end.x - 192,
        end.x + 192,
        end.x - 256,
        end.x + 256,
        start.x - 128,
        start.x + 128,
        start.x - 256,
        start.x + 256,
        ...path.slice(1, -1).map(point => point.x),
      ],
      48,
    );

    const sourceSidePoint = path[2];
    const sourceSideAxis = sourceSidePoint ? displayAxisOf(startNext, sourceSidePoint) : null;
    return streamDirectionalOuterLaneCandidateBatches({
      laneCount: laneValues.length,
      sourceStubCount: sourceStubLengths.length,
      targetStubCount: targetStubLengths.length,
      batchSize: STRICT_OUTER_LANE_MAX_CANDIDATES,
      candidateKey,
      createCandidates: (laneIndex, sourceStubIndex, targetStubIndex) => {
        const laneX = laneValues[laneIndex];
        const sourceStubLength = sourceStubLengths[sourceStubIndex];
        const targetStubLength = targetStubLengths[targetStubIndex];
        const targetStub = { x: end.x, y: end.y - targetDirection * targetStubLength };
        const candidates: DisplayPoint[][] = [];

        if (
          Math.abs(laneX - start.x) >= OBSTACLE_REPAIR_NODE_PADDING
          && Math.abs(laneX - end.x) >= OBSTACLE_REPAIR_NODE_PADDING
        ) {
          const sourceStub = { x: start.x, y: start.y + sourceDirection * sourceStubLength };
          candidates.push(compactOrthogonalPath([
            start,
            sourceStub,
            { x: laneX, y: sourceStub.y },
            { x: laneX, y: targetStub.y },
            targetStub,
            end,
          ]));
        }

        if (sourceSidePoint && sourceSideAxis === 'h') {
          const sideX = sourceSidePoint.x;
          if (
            Math.abs(laneX - sideX) >= OBSTACLE_REPAIR_NODE_PADDING
            && Math.abs(laneX - end.x) >= OBSTACLE_REPAIR_NODE_PADDING
          ) {
            const sourceBridge = { x: sideX, y: start.y + sourceDirection * sourceStubLength };
            candidates.push(compactOrthogonalPath([
              start,
              startNext,
              { x: sideX, y: startNext.y },
              sourceBridge,
              { x: laneX, y: sourceBridge.y },
              { x: laneX, y: targetStub.y },
              targetStub,
              end,
            ]));
          }
        }

        return candidates.filter(candidate => candidate.length >= 2 && candidate.every(isFinitePoint));
      },
    });
  } else {
    const sourceDirection = Math.sign(startNext.x - start.x) || Math.sign(end.x - start.x) || 1;
    const targetDirection = Math.sign(end.x - endPrevious.x) || Math.sign(end.x - start.x) || sourceDirection;
    const laneValues = prioritizeLaneValues(
      end.y,
      [
        minY - laneGap,
        minY - laneGap - 32,
        minY - laneGap - 64,
        minY - laneGap - 128,
        minY - laneGap - 224,
        maxY + laneGap,
        maxY + laneGap + 32,
        maxY + laneGap + 64,
        maxY + laneGap + 128,
        maxY + laneGap + 224,
      ],
      [
        end.y - 64,
        end.y + 64,
        end.y - 96,
        end.y + 96,
        end.y - 128,
        end.y + 128,
        end.y - 192,
        end.y + 192,
        end.y - 256,
        end.y + 256,
        start.y - 128,
        start.y + 128,
        start.y - 256,
        start.y + 256,
        ...path.slice(1, -1).map(point => point.y),
      ],
      48,
    );

    return streamDirectionalOuterLaneCandidateBatches({
      laneCount: laneValues.length,
      sourceStubCount: sourceStubLengths.length,
      targetStubCount: targetStubLengths.length,
      batchSize: STRICT_OUTER_LANE_MAX_CANDIDATES,
      candidateKey,
      createCandidates: (laneIndex, sourceStubIndex, targetStubIndex) => {
        const laneY = laneValues[laneIndex];
        if (
          Math.abs(laneY - start.y) < OBSTACLE_REPAIR_NODE_PADDING
          || Math.abs(laneY - end.y) < OBSTACLE_REPAIR_NODE_PADDING
        ) return [];
        const sourceStubLength = sourceStubLengths[sourceStubIndex];
        const targetStubLength = targetStubLengths[targetStubIndex];
        const sourceStub = { x: start.x + sourceDirection * sourceStubLength, y: start.y };
        const targetStub = { x: end.x - targetDirection * targetStubLength, y: end.y };
        const candidate = compactOrthogonalPath([
          start,
          sourceStub,
          { x: sourceStub.x, y: laneY },
          { x: targetStub.x, y: laneY },
          targetStub,
          end,
        ]);
        return candidate.length >= 2 && candidate.every(isFinitePoint) ? [candidate] : [];
      },
    });
  }
};
