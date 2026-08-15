import type { Edge } from '@xyflow/react';

import {
  displayAxisOf,
  getDisplayComputedPath,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const MIN_DISPLAY_ENDPOINT_STUB = 48;

export const buildPairedTerminalStrictCandidates = <T extends Edge[]>(
  edges: T,
  terminalSegment: DisplaySegment,
  internalSegment: DisplaySegment,
): T[] => {
  const terminalPath = getDisplayComputedPath(edges[terminalSegment.edgeIndex]);
  const internalPath = getDisplayComputedPath(edges[internalSegment.edgeIndex]);
  if (terminalPath.length < 5 || internalPath.length < 4) return [];
  const terminalAtStart = terminalSegment.segmentIndex === 0;
  const terminalAtEnd = terminalSegment.segmentIndex === terminalPath.length - 2;
  if (!terminalAtStart && !terminalAtEnd) return [];
  if (
    internalSegment.segmentIndex <= 0
    || internalSegment.segmentIndex >= internalPath.length - 2
    || terminalSegment.axis === internalSegment.axis
  ) return [];

  const candidates: T[] = [];
  const appendCandidate = (nextTerminalPath: DisplayPoint[], nextInternalPath: DisplayPoint[]) => {
    const nextEdges = edges.map((edge, edgeIndex) => {
      if (edgeIndex === terminalSegment.edgeIndex) return withDisplayComputedPath(edge, nextTerminalPath);
      if (edgeIndex === internalSegment.edgeIndex) return withDisplayComputedPath(edge, nextInternalPath);
      return edge;
    }) as T;
    candidates.push(nextEdges);
  };

  if (terminalSegment.axis === 'v' && internalSegment.axis === 'h') {
    const internalEndYValues = [
      internalPath[internalPath.length - 1]?.y,
      internalPath[0]?.y,
      internalPath[internalSegment.segmentIndex + 2]?.y,
      internalPath[internalSegment.segmentIndex - 1]?.y,
    ].filter((value): value is number => Number.isFinite(value));
    const shiftedInternalPaths = sortedUniqueNumbers(internalEndYValues, internalSegment.a.y)
      .slice(0, 4)
      .map(laneY => shiftDisplayInternalSegment(internalPath, internalSegment.segmentIndex, 'h', laneY))
      .filter((path): path is DisplayPoint[] => path !== null);
    if (shiftedInternalPaths.length === 0) return [];

    const horizontalMinX = Math.min(internalSegment.a.x, internalSegment.b.x);
    const horizontalMaxX = Math.max(internalSegment.a.x, internalSegment.b.x);
    const terminalVerticalIndices = terminalPath
      .map((point, index) => ({ index, point }))
      .slice(0, -1)
      .filter(({ index }) => index > 0 && index < terminalPath.length - 2)
      .filter(({ index }) => displayAxisOf(terminalPath[index], terminalPath[index + 1]) === 'v')
      .map(({ index }) => index);
    const preferredTerminalIndex = terminalAtStart
      ? terminalVerticalIndices[0]
      : terminalVerticalIndices[terminalVerticalIndices.length - 1];
    if (preferredTerminalIndex === undefined) return [];
    const laneXValues = sortedUniqueNumbers([
      horizontalMinX - MIN_DISPLAY_ENDPOINT_STUB,
      horizontalMinX - RESIDUAL_PARALLEL_LANE_GAP,
      horizontalMinX - RESIDUAL_PARALLEL_LANE_GAP * 2,
      horizontalMaxX + MIN_DISPLAY_ENDPOINT_STUB,
      horizontalMaxX + RESIDUAL_PARALLEL_LANE_GAP,
      horizontalMaxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], terminalPath[preferredTerminalIndex].x);
    const shiftedTerminalPaths = laneXValues
      .slice(0, 8)
      .map(laneX => shiftDisplayInternalSegment(terminalPath, preferredTerminalIndex, 'v', laneX))
      .filter((path): path is DisplayPoint[] => path !== null);
    for (const nextInternalPath of shiftedInternalPaths) {
      for (const nextTerminalPath of shiftedTerminalPaths) {
        appendCandidate(nextTerminalPath, nextInternalPath);
      }
    }
    return candidates;
  }

  if (terminalSegment.axis === 'h' && internalSegment.axis === 'v') {
    const internalEndXValues = [
      internalPath[internalPath.length - 1]?.x,
      internalPath[0]?.x,
      internalPath[internalSegment.segmentIndex + 2]?.x,
      internalPath[internalSegment.segmentIndex - 1]?.x,
    ].filter((value): value is number => Number.isFinite(value));
    const shiftedInternalPaths = sortedUniqueNumbers(internalEndXValues, internalSegment.a.x)
      .slice(0, 4)
      .map(laneX => shiftDisplayInternalSegment(internalPath, internalSegment.segmentIndex, 'v', laneX))
      .filter((path): path is DisplayPoint[] => path !== null);
    if (shiftedInternalPaths.length === 0) return [];

    const verticalMinY = Math.min(internalSegment.a.y, internalSegment.b.y);
    const verticalMaxY = Math.max(internalSegment.a.y, internalSegment.b.y);
    const terminalHorizontalIndices = terminalPath
      .map((point, index) => ({ index, point }))
      .slice(0, -1)
      .filter(({ index }) => index > 0 && index < terminalPath.length - 2)
      .filter(({ index }) => displayAxisOf(terminalPath[index], terminalPath[index + 1]) === 'h')
      .map(({ index }) => index);
    const preferredTerminalIndex = terminalAtStart
      ? terminalHorizontalIndices[0]
      : terminalHorizontalIndices[terminalHorizontalIndices.length - 1];
    if (preferredTerminalIndex === undefined) return [];
    const laneYValues = sortedUniqueNumbers([
      verticalMinY - MIN_DISPLAY_ENDPOINT_STUB,
      verticalMinY - RESIDUAL_PARALLEL_LANE_GAP,
      verticalMinY - RESIDUAL_PARALLEL_LANE_GAP * 2,
      verticalMaxY + MIN_DISPLAY_ENDPOINT_STUB,
      verticalMaxY + RESIDUAL_PARALLEL_LANE_GAP,
      verticalMaxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], terminalPath[preferredTerminalIndex].y);
    const shiftedTerminalPaths = laneYValues
      .slice(0, 8)
      .map(laneY => shiftDisplayInternalSegment(terminalPath, preferredTerminalIndex, 'h', laneY))
      .filter((path): path is DisplayPoint[] => path !== null);
    for (const nextInternalPath of shiftedInternalPaths) {
      for (const nextTerminalPath of shiftedTerminalPaths) {
        appendCandidate(nextTerminalPath, nextInternalPath);
      }
    }
  }

  return candidates;
};
