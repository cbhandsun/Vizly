import type { Edge, Node, XYPosition } from '@xyflow/react';

import {
  edgeTerminalSideCanSwitch,
  resolveEdgeTerminalHandleForSide,
} from '../../routing/utils/edgeTerminalPolicy';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  fastDisplayHardSafetyIsClean,
} from './baseReactFlowFastEdgeSafety';
import { isFinitePoint } from './baseReactFlowDisplayCache';
import {
  type AnchorSide,
  type NodeRect,
  compactOrthogonalPath,
  getNodeRect,
  sideForHandle,
} from './baseReactFlowDisplayEdgeGeometry';
import { ensureMinimumOutwardTerminalStub } from './baseReactFlowDisplayMinimumTerminalStub';
import {
  computedEndpointPathOf,
  displayEndpointCandidateDegradesGraph,
} from './baseReactFlowDisplayEndpointCandidateQuality';

type EndpointEdgeData = Record<string, unknown> & {
  computedPath?: unknown;
  treeRouting?: (Record<string, unknown> & { points?: unknown }) | null;
};

const LOCKED_ENDPOINT_MAX_CORRECTION = 80;
const DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE = 2;
const DISPLAY_ENDPOINT_OUTWARD_STUB = 48;
const DISPLAY_ENDPOINT_MIN_OUTWARD_STUB = 32;
const DISPLAY_PORT_AXIS_DOMINANCE = 1.4;
const DISPLAY_PORT_CORNER_TOLERANCE = 16;
const DISPLAY_PORT_CORNER_INSET = 16;
const DISPLAY_PORT_MAX_LENGTH_FACTOR = 1.15;

const closestRectSide = (point: XYPosition, rect: NodeRect): AnchorSide => {
  const distances: Array<{ side: AnchorSide; distance: number }> = [
    { side: 'left', distance: Math.abs(point.x - rect.x) },
    { side: 'right', distance: Math.abs(point.x - (rect.x + rect.width)) },
    { side: 'top', distance: Math.abs(point.y - rect.y) },
    { side: 'bottom', distance: Math.abs(point.y - (rect.y + rect.height)) },
  ];
  distances.sort((first, second) => first.distance - second.distance);
  return distances[0].side;
};

const clampToRange = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, value))
);

const anchorLockedTerminal = (
  path: XYPosition[],
  terminalIndex: number,
  rect: NodeRect,
  handle?: string | null,
): boolean => {
  const terminal = path[terminalIndex];
  if (!terminal) return false;
  const requestedSide = sideForHandle(handle);
  const nearestSide = closestRectSide(terminal, rect);
  const candidateSides = requestedSide && requestedSide !== nearestSide
    ? [requestedSide, nearestSide]
    : [requestedSide || nearestSide];

  for (const side of candidateSides) {
    const desired = { ...terminal };
    if (side === 'top' || side === 'bottom') {
      const boundaryY = side === 'top' ? rect.y : rect.y + rect.height;
      const normalCorrection = Math.abs(terminal.y - boundaryY);
      const overflowX = terminal.x < rect.x
        ? rect.x - terminal.x
        : Math.max(0, terminal.x - (rect.x + rect.width));
      if (
        normalCorrection > LOCKED_ENDPOINT_MAX_CORRECTION
        || (overflowX > LOCKED_ENDPOINT_MAX_CORRECTION && normalCorrection > 3)
      ) continue;
      desired.x = clampToRange(terminal.x, rect.x, rect.x + rect.width);
      desired.y = boundaryY;
    } else {
      const boundaryX = side === 'left' ? rect.x : rect.x + rect.width;
      const normalCorrection = Math.abs(terminal.x - boundaryX);
      const overflowY = terminal.y < rect.y
        ? rect.y - terminal.y
        : Math.max(0, terminal.y - (rect.y + rect.height));
      if (
        normalCorrection > LOCKED_ENDPOINT_MAX_CORRECTION
        || (overflowY > LOCKED_ENDPOINT_MAX_CORRECTION && normalCorrection > 3)
      ) continue;
      desired.x = boundaryX;
      desired.y = clampToRange(terminal.y, rect.y, rect.y + rect.height);
    }
    if (Math.abs(desired.x - terminal.x) <= 0.5 && Math.abs(desired.y - terminal.y) <= 0.5) continue;
    path[terminalIndex] = desired;
    const neighborIndex = terminalIndex === 0 ? 1 : terminalIndex - 1;
    const neighbor = path[neighborIndex];
    if (neighbor && path.length > 2) {
      const terminalSegmentWasVertical = Math.abs(neighbor.x - terminal.x) <= 0.5;
      const terminalSegmentWasHorizontal = Math.abs(neighbor.y - terminal.y) <= 0.5;
      path[neighborIndex] = terminalSegmentWasVertical
        ? { ...neighbor, x: desired.x }
        : terminalSegmentWasHorizontal
          ? { ...neighbor, y: desired.y }
          : side === 'top' || side === 'bottom'
            ? { ...neighbor, x: desired.x }
            : { ...neighbor, y: desired.y };
    }
    return true;
  }
  return false;
};

const ensureOutwardTerminalStub = (
  path: XYPosition[],
  terminalIndex: number,
  rect: NodeRect,
  handle?: string | null,
): boolean => {
  if (path.length < 3) return false;
  const isSource = terminalIndex === 0;
  const terminal = path[terminalIndex];
  const adjacentIndex = isSource ? 1 : path.length - 2;
  const nextIndex = isSource ? 2 : path.length - 3;
  const adjacent = path[adjacentIndex];
  const next = path[nextIndex];
  if (!terminal || !adjacent || !next) return false;

  const requestedSide = sideForHandle(handle);
  const requestedSideMatchesTerminal = requestedSide === 'top'
    ? Math.abs(terminal.y - rect.y) <= DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    : requestedSide === 'bottom'
      ? Math.abs(terminal.y - (rect.y + rect.height)) <= DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
      : requestedSide === 'left'
        ? Math.abs(terminal.x - rect.x) <= DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
        : requestedSide === 'right'
          ? Math.abs(terminal.x - (rect.x + rect.width)) <= DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
          : false;
  const side = requestedSideMatchesTerminal
    ? requestedSide as AnchorSide
    : closestRectSide(terminal, rect);
  if (side === 'top' || side === 'bottom') {
    const boundaryY = side === 'top' ? rect.y : rect.y + rect.height;
    const outward = side === 'top' ? -1 : 1;
    if (
      Math.abs(terminal.y - boundaryY) > DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
      || terminal.x < rect.x - DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
      || terminal.x > rect.x + rect.width + DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
      || Math.abs(adjacent.y - terminal.y) > 0.5
      || Math.abs(adjacent.x - terminal.x) <= 0.5
      || Math.abs(next.x - adjacent.x) > 0.5
      || (next.y - boundaryY) * outward < DISPLAY_ENDPOINT_MIN_OUTWARD_STUB
    ) return false;
    const availableStub = (next.y - boundaryY) * outward;
    const usesExistingLane = availableStub < DISPLAY_ENDPOINT_OUTWARD_STUB + 24;
    const laneY = usesExistingLane
      ? next.y
      : boundaryY + outward * DISPLAY_ENDPOINT_OUTWARD_STUB;
    path[terminalIndex] = { ...terminal, y: boundaryY };
    const stub = { x: terminal.x, y: laneY };
    const corner = { x: adjacent.x, y: laneY };
    path.splice(
      adjacentIndex,
      1,
      ...(usesExistingLane
        ? [stub]
        : isSource ? [stub, corner] : [corner, stub]),
    );
    return true;
  }

  const boundaryX = side === 'left' ? rect.x : rect.x + rect.width;
  const outward = side === 'left' ? -1 : 1;
  if (
    Math.abs(terminal.x - boundaryX) > DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    || terminal.y < rect.y - DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    || terminal.y > rect.y + rect.height + DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    || Math.abs(adjacent.x - terminal.x) > 0.5
    || Math.abs(adjacent.y - terminal.y) <= 0.5
    || Math.abs(next.y - adjacent.y) > 0.5
    || (next.x - boundaryX) * outward < DISPLAY_ENDPOINT_MIN_OUTWARD_STUB
  ) return false;
  const availableStub = (next.x - boundaryX) * outward;
  const usesExistingLane = availableStub < DISPLAY_ENDPOINT_OUTWARD_STUB + 24;
  const laneX = usesExistingLane
    ? next.x
    : boundaryX + outward * DISPLAY_ENDPOINT_OUTWARD_STUB;
  path[terminalIndex] = { ...terminal, x: boundaryX };
  const stub = { x: laneX, y: terminal.y };
  const corner = { x: laneX, y: adjacent.y };
  path.splice(
    adjacentIndex,
    1,
    ...(usesExistingLane
      ? [stub]
      : isSource ? [stub, corner] : [corner, stub]),
  );
  return true;
};

const removeDegenerateDisplayPathPoints = (path: XYPosition[]): XYPosition[] => (
  path.filter((point, index) => {
    if (index === 0) return true;
    const previous = path[index - 1];
    return Math.abs(point.x - previous.x) > 0.5 || Math.abs(point.y - previous.y) > 0.5;
  })
);

const displayPathLength = (path: XYPosition[]): number => path.slice(1).reduce((total, point, index) => (
  total + Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y)
), 0);

const displayPathBends = (path: XYPosition[]): number => {
  let bends = 0;
  let previousAxis: 'horizontal' | 'vertical' | null = null;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const point = path[index];
    const axis = Math.abs(previous.x - point.x) <= 0.5
      ? 'vertical'
      : Math.abs(previous.y - point.y) <= 0.5
        ? 'horizontal'
        : null;
    if (!axis) return Number.POSITIVE_INFINITY;
    if (previousAxis && previousAxis !== axis) bends += 1;
    previousAxis = axis;
  }
  return bends;
};

const sideAxis = (side: AnchorSide): 'horizontal' | 'vertical' => (
  side === 'left' || side === 'right' ? 'horizontal' : 'vertical'
);

const pointDistanceToSide = (point: XYPosition, rect: NodeRect, side: AnchorSide): number => {
  if (side === 'left') return Math.abs(point.x - rect.x);
  if (side === 'right') return Math.abs(point.x - (rect.x + rect.width));
  if (side === 'top') return Math.abs(point.y - rect.y);
  return Math.abs(point.y - (rect.y + rect.height));
};

const segmentLeavesTowardSide = (
  start: XYPosition,
  end: XYPosition,
  side: AnchorSide,
): boolean => {
  if (side === 'left') return Math.abs(start.y - end.y) <= 0.5 && end.x < start.x - 0.5;
  if (side === 'right') return Math.abs(start.y - end.y) <= 0.5 && end.x > start.x + 0.5;
  if (side === 'top') return Math.abs(start.x - end.x) <= 0.5 && end.y < start.y - 0.5;
  return Math.abs(start.x - end.x) <= 0.5 && end.y > start.y + 0.5;
};

const preferredDisplayPortSides = (
  sourceRect: NodeRect,
  targetRect: NodeRect,
): { source: AnchorSide; target: AnchorSide } | null => {
  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };
  const targetCenter = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const shortSide = Math.max(1, Math.min(sourceRect.width, sourceRect.height));
  const horizontalDominance = Math.abs(dx) / Math.max(Math.abs(dy), shortSide);
  const verticalDominance = Math.abs(dy) / Math.max(Math.abs(dx), shortSide);
  if (horizontalDominance >= DISPLAY_PORT_AXIS_DOMINANCE) {
    return dx >= 0
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' };
  }
  if (verticalDominance >= DISPLAY_PORT_AXIS_DOMINANCE) {
    return dy >= 0
      ? { source: 'bottom', target: 'top' }
      : { source: 'top', target: 'bottom' };
  }
  return null;
};

const insetTerminalOnSide = (
  terminal: XYPosition,
  rect: NodeRect,
  side: AnchorSide,
): XYPosition => {
  if (side === 'left' || side === 'right') {
    const minY = rect.y + Math.min(DISPLAY_PORT_CORNER_INSET, rect.height / 2);
    const maxY = rect.y + rect.height - Math.min(DISPLAY_PORT_CORNER_INSET, rect.height / 2);
    return {
      x: side === 'left' ? rect.x : rect.x + rect.width,
      y: clampToRange(terminal.y, minY, maxY),
    };
  }
  const minX = rect.x + Math.min(DISPLAY_PORT_CORNER_INSET, rect.width / 2);
  const maxX = rect.x + rect.width - Math.min(DISPLAY_PORT_CORNER_INSET, rect.width / 2);
  return {
    x: clampToRange(terminal.x, minX, maxX),
    y: side === 'top' ? rect.y : rect.y + rect.height,
  };
};

const foldTerminalCornerElbow = ({
  path,
  rect,
  currentSide,
  preferredSide,
  terminalAtStart,
}: {
  path: XYPosition[];
  rect: NodeRect;
  currentSide: AnchorSide;
  preferredSide: AnchorSide;
  terminalAtStart: boolean;
}): XYPosition[] | null => {
  if (
    path.length < 4
    || currentSide === preferredSide
    || sideAxis(currentSide) === sideAxis(preferredSide)
  ) return null;
  const ordered = terminalAtStart ? path.map(point => ({ ...point })) : [...path].reverse().map(point => ({ ...point }));
  const [terminal, adjacent, next, afterNext] = ordered;
  if (
    pointDistanceToSide(terminal, rect, currentSide) > DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    || pointDistanceToSide(terminal, rect, preferredSide) > DISPLAY_PORT_CORNER_TOLERANCE
    || !segmentLeavesTowardSide(terminal, adjacent, currentSide)
    || !segmentLeavesTowardSide(adjacent, next, preferredSide)
    || (sideAxis(currentSide) === 'vertical'
      ? Math.abs(next.x - afterNext.x) > 0.5
      : Math.abs(next.y - afterNext.y) > 0.5)
  ) return null;

  const nextTerminal = insetTerminalOnSide(terminal, rect, preferredSide);
  const nextCorner = sideAxis(preferredSide) === 'horizontal'
    ? { x: next.x, y: nextTerminal.y }
    : { x: nextTerminal.x, y: next.y };
  const foldedOrdered = compactOrthogonalPath([nextTerminal, nextCorner, ...ordered.slice(3)]);
  const folded = terminalAtStart ? foldedOrdered : [...foldedOrdered].reverse();
  if (
    displayPathBends(folded) >= displayPathBends(path)
    || displayPathLength(folded) > displayPathLength(path) * DISPLAY_PORT_MAX_LENGTH_FACTOR + 0.5
  ) return null;
  return folded;
};

const buildPreferredPortSideCandidate = (
  edge: Edge,
  nodeById: Map<string, Node>,
): Edge => {
  const data = (edge.data || {}) as EndpointEdgeData;
  const path = computedEndpointPathOf(edge);
  if (path.length < 4) return edge;
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect) return edge;
  const preferred = preferredDisplayPortSides(sourceRect, targetRect);
  if (!preferred) return edge;

  let candidatePath = path.map(point => ({ ...point }));
  let sourceHandle = edge.sourceHandle;
  let targetHandle = edge.targetHandle;
  let sourceChanged = false;
  let targetChanged = false;
  if (edgeTerminalSideCanSwitch(edge, 'source', preferred.source)) {
    const currentSourceSide = sideForHandle(edge.sourceHandle) || closestRectSide(candidatePath[0], sourceRect);
    const foldedSource = foldTerminalCornerElbow({
      path: candidatePath,
      rect: sourceRect,
      currentSide: currentSourceSide,
      preferredSide: preferred.source,
      terminalAtStart: true,
    });
    if (foldedSource) {
      candidatePath = foldedSource;
      sourceHandle = resolveEdgeTerminalHandleForSide(edge, 'source', preferred.source);
      sourceChanged = true;
    }
  }
  if (edgeTerminalSideCanSwitch(edge, 'target', preferred.target)) {
    const currentTargetSide = sideForHandle(edge.targetHandle)
      || closestRectSide(candidatePath[candidatePath.length - 1], targetRect);
    const foldedTarget = foldTerminalCornerElbow({
      path: candidatePath,
      rect: targetRect,
      currentSide: currentTargetSide,
      preferredSide: preferred.target,
      terminalAtStart: false,
    });
    if (foldedTarget) {
      candidatePath = foldedTarget;
      targetHandle = resolveEdgeTerminalHandleForSide(edge, 'target', preferred.target);
      targetChanged = true;
    }
  }
  if (!sourceChanged && !targetChanged) return edge;

  const treeRouting = data.treeRouting && typeof data.treeRouting === 'object'
    ? {
      ...data.treeRouting,
      ...(sourceChanged ? { effectiveSourceHandle: sourceHandle } : {}),
      ...(targetChanged ? { effectiveTargetHandle: targetHandle } : {}),
      points: candidatePath,
    }
    : data.treeRouting;
  return {
    ...edge,
    sourceHandle,
    targetHandle,
    data: {
      ...data,
      computedPath: candidatePath,
      treeRouting,
      renderPortSideCorrected: true,
      renderPortSideReason: 'dominant-axis-avoidable-endpoint-elbow',
    },
  };
};

const anchorComputedPathEndpoints = (
  edge: Edge,
  nodeById: Map<string, Node>,
): Edge => {
  const data = (edge.data || {}) as EndpointEdgeData;
  if (
    !Array.isArray(data.computedPath)
    || data.computedPath.length < 2
    || !data.computedPath.every(isFinitePoint)
  ) return edge;
  const path = (data.computedPath as XYPosition[]).map(point => ({ ...point }));
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect || path.length < 2) return edge;

  const sourceAnchored = anchorLockedTerminal(path, 0, sourceRect, edge.sourceHandle);
  const targetAnchored = anchorLockedTerminal(
    path,
    path.length - 1,
    targetRect,
    edge.targetHandle,
  );
  const anchoredSourceSide = closestRectSide(path[0], sourceRect);
  const anchoredTargetSide = closestRectSide(path[path.length - 1], targetRect);
  const requestedSourceSide = sideForHandle(edge.sourceHandle);
  const requestedTargetSide = sideForHandle(edge.targetHandle);
  const sourceGeometrySide = pointDistanceToSide(path[0], sourceRect, anchoredSourceSide)
      <= DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    && segmentLeavesTowardSide(path[0], path[1], anchoredSourceSide)
    ? anchoredSourceSide
    : null;
  const targetGeometrySide = pointDistanceToSide(
    path[path.length - 1],
    targetRect,
    anchoredTargetSide,
  ) <= DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    && segmentLeavesTowardSide(
      path[path.length - 1],
      path[path.length - 2],
      anchoredTargetSide,
    )
    ? anchoredTargetSide
    : null;
  const sourceHandleMaterialized = Boolean(
    !requestedSourceSide
    && sourceGeometrySide
    && edgeTerminalSideCanSwitch(edge, 'source', sourceGeometrySide),
  );
  const targetHandleMaterialized = Boolean(
    !requestedTargetSide
    && targetGeometrySide
    && edgeTerminalSideCanSwitch(edge, 'target', targetGeometrySide),
  );
  const sourceHandleChanged = Boolean(
    sourceHandleMaterialized
    || (
      sourceAnchored
      && requestedSourceSide
      && requestedSourceSide !== anchoredSourceSide
      && edgeTerminalSideCanSwitch(edge, 'source', anchoredSourceSide)
    )
  );
  const targetHandleChanged = Boolean(
    targetHandleMaterialized
    || (
      targetAnchored
      && requestedTargetSide
      && requestedTargetSide !== anchoredTargetSide
      && edgeTerminalSideCanSwitch(edge, 'target', anchoredTargetSide)
    )
  );
  const sourceChanged = sourceAnchored || sourceHandleChanged;
  const targetChanged = targetAnchored || targetHandleChanged;
  if (!sourceChanged && !targetChanged) return edge;
  const sourceHandle = sourceHandleChanged
    ? resolveEdgeTerminalHandleForSide(
      edge,
      'source',
      sourceGeometrySide ?? anchoredSourceSide,
    )
    : edge.sourceHandle;
  const targetHandle = targetHandleChanged
    ? resolveEdgeTerminalHandleForSide(
      edge,
      'target',
      targetGeometrySide ?? anchoredTargetSide,
    )
    : edge.targetHandle;
  const treeRouting = data.treeRouting && Array.isArray(data.treeRouting.points)
    ? {
      ...data.treeRouting,
      points: path,
      ...(sourceHandleChanged ? { effectiveSourceHandle: sourceHandle } : {}),
      ...(targetHandleChanged ? { effectiveTargetHandle: targetHandle } : {}),
    }
    : data.treeRouting;
  return {
    ...edge,
    sourceHandle,
    targetHandle,
    data: {
      ...data,
      computedPath: path,
      treeRouting,
    },
  };
};

const normalizeComputedDisplayPath = (edge: Edge): Edge => {
  const data = (edge.data || {}) as EndpointEdgeData;
  if (!Array.isArray(data.computedPath) || !data.computedPath.every(isFinitePoint)) return edge;
  const path = data.computedPath as XYPosition[];
  const normalizedPath = removeDegenerateDisplayPathPoints(path);
  if (normalizedPath.length === path.length) return edge;
  return {
    ...edge,
    data: {
      ...data,
      computedPath: normalizedPath,
      treeRouting: data.treeRouting && Array.isArray(data.treeRouting.points)
        ? { ...data.treeRouting, points: normalizedPath }
        : data.treeRouting,
    },
  };
};

const addComputedPathEndpointStubs = (
  edge: Edge,
  nodeById: Map<string, Node>,
): Edge => {
  const data = (edge.data || {}) as EndpointEdgeData;
  if (
    !Array.isArray(data.computedPath)
    || data.computedPath.length < 3
    || !data.computedPath.every(isFinitePoint)
  ) return edge;
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect) return edge;
  const path = (data.computedPath as XYPosition[]).map(point => ({ ...point }));
  let sourceChanged = ensureOutwardTerminalStub(path, 0, sourceRect, edge.sourceHandle);
  let targetChanged = ensureOutwardTerminalStub(
    path,
    path.length - 1,
    targetRect,
    edge.targetHandle,
  );
  sourceChanged = ensureMinimumOutwardTerminalStub(
    path,
    0,
    sourceRect,
    edge.sourceHandle,
    closestRectSide(path[0], sourceRect),
  ) || sourceChanged;
  targetChanged = ensureMinimumOutwardTerminalStub(
    path,
    path.length - 1,
    targetRect,
    edge.targetHandle,
    closestRectSide(path[path.length - 1], targetRect),
  ) || targetChanged;
  if (!sourceChanged && !targetChanged) return edge;
  const committedPath = removeDegenerateDisplayPathPoints(path);
  return {
    ...edge,
    data: {
      ...data,
      computedPath: committedPath,
      treeRouting: data.treeRouting && Array.isArray(data.treeRouting.points)
        ? { ...data.treeRouting, points: committedPath }
        : data.treeRouting,
    },
  };
};

/**
 * Commits only terminal boundary geometry after route quality selection.
 *
 * Unlike the interactive endpoint beautifier below, this boundary does not
 * fold dominant-axis elbows. It keeps the accepted route lanes intact while
 * snapping sub-pixel terminal drift and turning a boundary tangent into one
 * short outward stub when the adjacent lane already provides enough room.
 */
export const commitComputedDisplayEdgeTerminals = (
  edges: Edge[],
  nodes: Node[],
): Edge[] => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const anchored = edges
    .map(edge => anchorComputedPathEndpoints(edge, nodeById))
    .map(normalizeComputedDisplayPath);
  const accepted = [...anchored];
  accepted.forEach((edge, index) => {
    const candidate = addComputedPathEndpointStubs(edge, nodeById);
    if (candidate === edge) return;
    if (fastDisplayHardSafetyIsClean([candidate], nodes)) accepted[index] = candidate;
  });
  const baselineQuality = calculateEdgePathQualityScore(anchored);
  const acceptedQuality = calculateEdgePathQualityScore(accepted);
  return acceptedQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
    && acceptedQuality.strictCrossings <= baselineQuality.strictCrossings
    && acceptedQuality.reverseOverlap <= baselineQuality.reverseOverlap
    && acceptedQuality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
    && acceptedQuality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
    && acceptedQuality.shortEndpointStubs <= baselineQuality.shortEndpointStubs
    && acceptedQuality.tinyInteriorDoglegs <= baselineQuality.tinyInteriorDoglegs
    && acceptedQuality.hairpins <= baselineQuality.hairpins
    ? accepted
    : anchored;
};

export const anchorComputedDisplayEdgeEndpoints = (edges: Edge[], nodes: Node[]): Edge[] => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const anchored = edges.map(edge => anchorComputedPathEndpoints(edge, nodeById));
  const accepted = [...anchored];
  accepted.forEach((edge, index) => {
    const candidate = buildPreferredPortSideCandidate(edge, nodeById);
    if (candidate !== edge && !displayEndpointCandidateDegradesGraph({
      candidate,
      original: edge,
      edgeIndex: index,
      contextEdges: accepted,
      nodes,
    })) accepted[index] = candidate;
  });
  accepted.forEach((edge, index) => {
    const candidate = addComputedPathEndpointStubs(edge, nodeById);
    if (candidate === edge) return;
    if (!displayEndpointCandidateDegradesGraph({
      candidate,
      original: edge,
      edgeIndex: index,
      contextEdges: accepted,
      nodes,
    })) accepted[index] = candidate;
  });
  return accepted;
};
