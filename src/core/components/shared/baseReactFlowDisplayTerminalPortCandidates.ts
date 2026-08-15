import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { buildSharedNodeTerminalSideCandidates } from './baseReactFlowSharedNodePortRoleRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import { buildCrossedHorizontalMixedTerminalBridgeVariants } from './baseReactFlowDisplayMixedTerminalBridgeCandidates';
import {
  displayTerminalSideCanSwitch,
} from './baseReactFlowDisplayTerminalPolicy';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';
import {
  displayAxisOf,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  OBSTACLE_REPAIR_NODE_PADDING,
  oppositeDisplayPortSide,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

export { displayTerminalSideCanSwitch } from './baseReactFlowDisplayTerminalPolicy';

const MIN_DISPLAY_ENDPOINT_STUB = 48;
const MIN_MIXED_OUTER_PORT_STUB = 56;
const TERMINAL_SIDE_TOLERANCE = 2;

const pointOnDeclaredTerminalSide = (
  point: DisplayPoint,
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint | null => {
  const tangentMinimum = side === 'left' || side === 'right' ? rect.y : rect.x;
  const tangentMaximum = tangentMinimum + (
    side === 'left' || side === 'right' ? rect.height : rect.width
  );
  const tangent = side === 'left' || side === 'right' ? point.y : point.x;
  if (
    tangent < tangentMinimum - TERMINAL_SIDE_TOLERANCE
    || tangent > tangentMaximum + TERMINAL_SIDE_TOLERANCE
  ) return null;
  if (side === 'left') return { x: rect.x, y: tangent };
  if (side === 'right') return { x: rect.x + rect.width, y: tangent };
  if (side === 'top') return { x: tangent, y: rect.y };
  return { x: tangent, y: rect.y + rect.height };
};

/**
 * Replaces a tangential terminal departure with an outward stub while keeping
 * the terminal's existing slot on the declared node side. Reusing that slot is
 * important when the side centre is already occupied by an opposite-flow edge.
 * Candidates splice into an existing parallel segment, so the untouched
 * terminal and the stable remainder of the route stay unchanged.
 */
export const buildDeclaredTerminalAxisStubCandidates = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
  minStub = MIN_DISPLAY_ENDPOINT_STUB,
  maxCandidates = 6,
): DisplayPoint[][] => {
  if (
    path.length < 3
    || !Number.isFinite(minStub)
    || minStub <= 0
    || !Number.isInteger(maxCandidates)
    || maxCandidates <= 0
  ) return [];
  const oriented = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const terminal = pointOnDeclaredTerminalSide(oriented[0], rect, side);
  if (!terminal) return [];
  const horizontalTerminal = side === 'left' || side === 'right';
  const expectedAxis = horizontalTerminal ? 'h' : 'v';
  const outwardDirection = side === 'right' || side === 'bottom' ? 1 : -1;
  const boundary = horizontalTerminal ? terminal.x : terminal.y;
  const laneCoordinates = [
    boundary + outwardDirection * minStub,
    boundary + outwardDirection * (minStub + RESIDUAL_PARALLEL_LANE_GAP),
    boundary + outwardDirection * (minStub + RESIDUAL_PARALLEL_LANE_GAP * 2),
  ].filter((coordinate, index, coordinates) => (
    Number.isFinite(coordinate)
    && coordinates.findIndex(other => Math.abs(other - coordinate) <= 0.5) === index
  )).sort((first, second) => (
    Math.abs(first - boundary) - Math.abs(second - boundary)
  ));
  const candidates: DisplayPoint[][] = [];
  const seen = new Set<string>();

  for (const laneCoordinate of laneCoordinates) {
    for (let segmentIndex = 1; segmentIndex < oriented.length - 1; segmentIndex += 1) {
      const segmentStart = oriented[segmentIndex];
      const segmentEnd = oriented[segmentIndex + 1];
      if (displayAxisOf(segmentStart, segmentEnd) !== expectedAxis) continue;
      const segmentMinimum = horizontalTerminal
        ? Math.min(segmentStart.x, segmentEnd.x)
        : Math.min(segmentStart.y, segmentEnd.y);
      const segmentMaximum = horizontalTerminal
        ? Math.max(segmentStart.x, segmentEnd.x)
        : Math.max(segmentStart.y, segmentEnd.y);
      if (
        laneCoordinate < segmentMinimum - TERMINAL_SIDE_TOLERANCE
        || laneCoordinate > segmentMaximum + TERMINAL_SIDE_TOLERANCE
      ) continue;
      const stub = horizontalTerminal
        ? { x: laneCoordinate, y: terminal.y }
        : { x: terminal.x, y: laneCoordinate };
      const splice = horizontalTerminal
        ? { x: laneCoordinate, y: segmentStart.y }
        : { x: segmentStart.x, y: laneCoordinate };
      const candidateOriented = compactOrthogonalPath([
        terminal,
        stub,
        splice,
        segmentEnd,
        ...oriented.slice(segmentIndex + 2),
      ]);
      const candidate = role === 'source'
        ? candidateOriented
        : [...candidateOriented].reverse();
      if (candidate.length < 2) continue;
      const key = candidate.map(point => `${point.x}:${point.y}`).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
      if (candidates.length >= maxCandidates) return candidates;
    }
  }
  return candidates;
};

export const displayTerminalRoleNeedsDeclaredAxisRepair = (
  edge: Edge,
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
): boolean => {
  const endpoint = role === 'source' ? path[0] : path[path.length - 1];
  const neighbor = role === 'source' ? path[1] : path[path.length - 2];
  const side = fullDisplayPortSide(normalizeHandle(
    role === 'source' ? edge.sourceHandle : edge.targetHandle,
  ));
  if (!endpoint || !neighbor || !side) return true;
  const onDeclaredSide = side === 'top'
    ? Math.abs(endpoint.y - rect.y) <= 2
    : side === 'bottom'
      ? Math.abs(endpoint.y - (rect.y + rect.height)) <= 2
      : side === 'left'
        ? Math.abs(endpoint.x - rect.x) <= 2
        : Math.abs(endpoint.x - (rect.x + rect.width)) <= 2;
  if (!onDeclaredSide) return true;
  // A declared handle disambiguates source breakout direction. Target arrows
  // are different: render/audit consumers can still infer the adjacent side
  // from an exact rectangle corner and paint a misleading final approach.
  // Keep only target terminals slightly inset from tangential extremes.
  const tangent = side === 'top' || side === 'bottom' ? endpoint.x : endpoint.y;
  const tangentMinimum = side === 'top' || side === 'bottom' ? rect.x : rect.y;
  const tangentMaximum = tangentMinimum
    + (side === 'top' || side === 'bottom' ? rect.width : rect.height);
  if (role === 'target' && (
    tangent <= tangentMinimum + 2
    || tangent >= tangentMaximum - 2
  )) return true;
  const axis = displayAxisOf(endpoint, neighbor);
  if (side === 'top') return axis !== 'v' || neighbor.y >= endpoint.y - 1;
  if (side === 'bottom') return axis !== 'v' || neighbor.y <= endpoint.y + 1;
  if (side === 'left') return axis !== 'h' || neighbor.x >= endpoint.x - 1;
  return axis !== 'h' || neighbor.x <= endpoint.x + 1;
};

export { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';

export const buildOppositeRoleSharedNodeCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  first: DisplaySegment,
  second: DisplaySegment,
): T[] => {
  const firstEdge = edges[first.edgeIndex];
  const secondEdge = edges[second.edgeIndex];
  if (!firstEdge || !secondEdge) return [];

  const orientations = [
    { outgoingEdge: firstEdge, outgoingSegment: first, incomingEdge: secondEdge, incomingSegment: second },
    { outgoingEdge: secondEdge, outgoingSegment: second, incomingEdge: firstEdge, incomingSegment: first },
  ];
  for (const orientation of orientations) {
    if (orientation.outgoingEdge.source !== orientation.incomingEdge.target) continue;
    const incomingPath = getDisplayComputedPath(orientation.incomingEdge);
    if (
      orientation.incomingSegment.segmentIndex !== incomingPath.length - 2
      || orientation.outgoingSegment.segmentIndex < 0
    ) continue;
    const outgoingSide = normalizeHandle(orientation.outgoingEdge.sourceHandle);
    const incomingSide = normalizeHandle(orientation.incomingEdge.targetHandle);
    const incomingSourceSide = fullDisplayPortSide(normalizeHandle(orientation.incomingEdge.sourceHandle));
    if (!outgoingSide || incomingSide !== outgoingSide || !incomingSourceSide) continue;
    const desiredTargetSide = oppositeDisplayPortSide(outgoingSide);
    if (!displayTerminalSideCanSwitch(orientation.incomingEdge, 'target', desiredTargetSide)) continue;
    const sharedNode = nodes.find(node => node.id === orientation.outgoingEdge.source);
    const sharedRect = sharedNode ? getDisplayNodeRect(sharedNode) : null;
    if (!sharedRect) continue;

    return buildSharedNodeTerminalSideCandidates(
      incomingPath,
      'target',
      sharedRect,
      desiredTargetSide,
      MIN_DISPLAY_ENDPOINT_STUB,
      3,
    ).map((candidatePath) => {
      const bridged = withDisplayPortBridge(
        orientation.incomingEdge,
        candidatePath,
        incomingSourceSide,
        desiredTargetSide,
      );
      return edges.map(edge => (
        edge === orientation.incomingEdge ? bridged : edge
      )) as T;
    });
  }
  return [];
};

export const buildCrossingCompanionOuterPortVariants = <T extends Edge[]>(
  edges: T,
  primary: DisplaySegment,
  companion: DisplaySegment,
  nodes: Node[],
): T[] => {
  if (primary.axis === companion.axis) return [];
  const edge = edges[companion.edgeIndex];
  if (!edge) return [];
  const companionPath = getDisplayComputedPath(edge);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  if (!sourceNode || !targetNode) return [];
  const sourceRect = getDisplayNodeRect(sourceNode);
  const targetRect = getDisplayNodeRect(targetNode);
  if (!sourceRect || !targetRect) return [];
  const primaryEdge = edges[primary.edgeIndex];
  const primarySourceNode = primaryEdge ? nodeById.get(primaryEdge.source) : undefined;
  const primaryTargetNode = primaryEdge ? nodeById.get(primaryEdge.target) : undefined;
  const primarySourceRect = primarySourceNode ? getDisplayNodeRect(primarySourceNode) : null;
  const primaryTargetRect = primaryTargetNode ? getDisplayNodeRect(primaryTargetNode) : null;
  const relevantRects = [sourceRect, targetRect, primarySourceRect, primaryTargetRect]
    .filter((rect): rect is DisplayRect => Boolean(rect));
  const variants: T[] = [];

  if (primary.axis === 'v' && companion.axis === 'h') {
    for (const side of ['top', 'bottom'] as const) {
      if (
        !displayTerminalSideCanSwitch(edge, 'source', side)
        || !displayTerminalSideCanSwitch(edge, 'target', side)
      ) continue;
      const source = {
        x: sourceRect.x + sourceRect.width / 2,
        y: side === 'top' ? sourceRect.y : sourceRect.y + sourceRect.height,
      };
      const target = {
        x: targetRect.x + targetRect.width / 2,
        y: side === 'top' ? targetRect.y : targetRect.y + targetRect.height,
      };
      const trunkY = side === 'top'
        ? Math.min(
          source.y,
          target.y,
          primary.a.y,
          primary.b.y,
          ...relevantRects.map(rect => rect.y),
        ) - MIN_DISPLAY_ENDPOINT_STUB
        : Math.max(
          source.y,
          target.y,
          primary.a.y,
          primary.b.y,
          ...relevantRects.map(rect => rect.y + rect.height),
        ) + MIN_DISPLAY_ENDPOINT_STUB;
      const path = compactOrthogonalPath([
        source,
        { x: source.x, y: trunkY },
        { x: target.x, y: trunkY },
        target,
      ]);
      const bridged = withDisplayPortBridge(edge, path, side, side);
      variants.push(edges.map((candidate, edgeIndex) => (
        edgeIndex === companion.edgeIndex ? bridged : candidate
      )) as T);
    }

    variants.push(...buildCrossedHorizontalMixedTerminalBridgeVariants({
      edges,
      primary,
      companion,
      nodes,
      bridgeEdge: withDisplayPortBridge,
    }));
  }

  if (primary.axis === 'h' && companion.axis === 'v') {
    for (const side of ['left', 'right'] as const) {
      if (
        !displayTerminalSideCanSwitch(edge, 'source', side)
        || !displayTerminalSideCanSwitch(edge, 'target', side)
      ) continue;
      const source = {
        x: side === 'left' ? sourceRect.x : sourceRect.x + sourceRect.width,
        y: sourceRect.y + sourceRect.height / 2,
      };
      const target = {
        x: side === 'left' ? targetRect.x : targetRect.x + targetRect.width,
        y: targetRect.y + targetRect.height / 2,
      };
      const trunkX = side === 'left'
        ? Math.min(
          source.x,
          target.x,
          primary.a.x,
          primary.b.x,
          ...relevantRects.map(rect => rect.x),
        ) - MIN_DISPLAY_ENDPOINT_STUB
        : Math.max(
          source.x,
          target.x,
          primary.a.x,
          primary.b.x,
          ...relevantRects.map(rect => rect.x + rect.width),
        ) + MIN_DISPLAY_ENDPOINT_STUB;
      const path = compactOrthogonalPath([
        source,
        { x: trunkX, y: source.y },
        { x: trunkX, y: target.y },
        target,
      ]);
      const bridged = withDisplayPortBridge(edge, path, side, side);
      variants.push(edges.map((candidate, edgeIndex) => (
        edgeIndex === companion.edgeIndex ? bridged : candidate
      )) as T);
    }

    // A same-side outer trunk can still cut through the node at the opposite
    // endpoint. Add mixed-side candidates that leave one endpoint laterally,
    // dip around its node, pass just beyond the crossed horizontal span, and
    // then rejoin the untouched remote terminal stub. This is the planar
    // escape needed when a vertical connection is topologically trapped by a
    // source bus and routing both endpoints to the same far side is excessive.
    const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
    const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    if (companionPath.length >= 4 && declaredSourceSide && declaredTargetSide) {
      const primaryMinX = Math.min(primary.a.x, primary.b.x);
      const primaryMaxX = Math.max(primary.a.x, primary.b.x);
      for (const role of ['source', 'target'] as const) {
        const terminalRect = role === 'source' ? sourceRect : targetRect;
        const oriented = role === 'source'
          ? companionPath.map(point => ({ ...point }))
          : [...companionPath].reverse().map(point => ({ ...point }));
        const remoteStub = oriented[oriented.length - 2];
        const remoteTerminal = oriented[oriented.length - 1];
        if (!remoteStub || !remoteTerminal || !displayAxisOf(remoteStub, remoteTerminal)) continue;
        const returnDirection = terminalRect.y + terminalRect.height / 2 >= remoteTerminal.y
          ? 1
          : -1;
        const returnBoundaryY = returnDirection > 0
          ? Math.max(...relevantRects.map(rect => rect.y + rect.height))
          : Math.min(...relevantRects.map(rect => rect.y));
        for (const side of ['left', 'right'] as const) {
          if (!displayTerminalSideCanSwitch(edge, role, side)) continue;
          const sideDirection = side === 'right' ? 1 : -1;
          const terminal = {
            x: side === 'right' ? terminalRect.x + terminalRect.width : terminalRect.x,
            y: terminalRect.y + terminalRect.height / 2,
          };
          const sideStub = {
            x: terminal.x + sideDirection * MIN_MIXED_OUTER_PORT_STUB,
            y: terminal.y,
          };
          const localOuterX = side === 'right'
            ? Math.max(sideStub.x, primaryMaxX + RESIDUAL_PARALLEL_LANE_GAP)
            : Math.min(sideStub.x, primaryMinX - RESIDUAL_PARALLEL_LANE_GAP);
          const farOuterX = side === 'right'
            ? Math.max(
              sideStub.x,
              ...relevantRects.map(rect => rect.x + rect.width),
            ) + MIN_DISPLAY_ENDPOINT_STUB
            : Math.min(sideStub.x, ...relevantRects.map(rect => rect.x))
              - MIN_DISPLAY_ENDPOINT_STUB;
          const outerLanes = [...new Set([localOuterX, farOuterX])];
          const returnLanes = [
            returnBoundaryY + returnDirection * RESIDUAL_PARALLEL_LANE_GAP,
            returnBoundaryY + returnDirection * MIN_DISPLAY_ENDPOINT_STUB,
          ];
          for (const outerX of outerLanes) {
            for (const returnY of returnLanes) {
              const candidateOriented = compactOrthogonalPath([
                terminal,
                sideStub,
                { x: sideStub.x, y: returnY },
                { x: outerX, y: returnY },
                { x: outerX, y: remoteStub.y },
                remoteStub,
                remoteTerminal,
              ]);
              if (candidateOriented.length < 4) continue;
              const candidatePath = role === 'source'
                ? candidateOriented
                : [...candidateOriented].reverse();
              const sourceSide = role === 'source' ? side : declaredSourceSide;
              const targetSide = role === 'target' ? side : declaredTargetSide;
              const bridged = withDisplayPortBridge(
                edge,
                candidatePath,
                sourceSide,
                targetSide,
              );
              variants.push(edges.map((candidate, edgeIndex) => (
                edgeIndex === companion.edgeIndex ? bridged : candidate
              )) as T);
            }
          }
        }
      }
    }
  }

  return variants;
};

export const buildStrictCrossingCompanionShiftVariants = <T extends Edge[]>(
  edges: T,
  primaryEdgeIndex: number,
): T[] => {
  const paths = edges.map(edge => getDisplayComputedPath(edge));
  const crossings = findStrictCrossings(paths, edges)
    .filter(hit => hit.a.edgeIndex === primaryEdgeIndex || hit.b.edgeIndex === primaryEdgeIndex)
    .slice(0, 4);
  if (crossings.length === 0) return [];

  const variants: T[] = [];
  for (const hit of crossings) {
    const primary = hit.a.edgeIndex === primaryEdgeIndex ? hit.a : hit.b;
    const companion = hit.a.edgeIndex === primaryEdgeIndex ? hit.b : hit.a;
    const companionPath = paths[companion.edgeIndex];
    const primaryPath = paths[primaryEdgeIndex] ?? [];
    if (!companionPath || companionPath.length < 4) continue;

    if (primary.axis === 'v' && companion.axis === 'h') {
      const minY = Math.min(primary.a.y, primary.b.y);
      const maxY = Math.max(primary.a.y, primary.b.y);
      const minX = Math.min(companion.a.x, companion.b.x);
      const maxX = Math.max(companion.a.x, companion.b.x);
      const blockingVerticalSpans = primaryPath
        .slice(0, -1)
        .map((point, segmentIndex) => ({
          start: point,
          end: primaryPath[segmentIndex + 1],
          axis: displayAxisOf(point, primaryPath[segmentIndex + 1]),
        }))
        .filter(segment => segment.axis === 'v')
        .filter(segment => segment.start.x > minX + 1 && segment.start.x < maxX - 1)
        .flatMap(segment => [segment.start.y, segment.end.y]);
      const aggregateMinY = blockingVerticalSpans.length > 0 ? Math.min(...blockingVerticalSpans) : minY;
      const aggregateMaxY = blockingVerticalSpans.length > 0 ? Math.max(...blockingVerticalSpans) : maxY;
      const laneValues = sortedUniqueNumbers(
        [
          minY - OBSTACLE_REPAIR_NODE_PADDING,
          minY - RESIDUAL_PARALLEL_LANE_GAP,
          minY - RESIDUAL_PARALLEL_LANE_GAP * 2,
          maxY + OBSTACLE_REPAIR_NODE_PADDING,
          maxY + RESIDUAL_PARALLEL_LANE_GAP,
          maxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
          aggregateMinY - OBSTACLE_REPAIR_NODE_PADDING,
          aggregateMinY - RESIDUAL_PARALLEL_LANE_GAP,
          aggregateMinY - RESIDUAL_PARALLEL_LANE_GAP * 2,
          aggregateMaxY + OBSTACLE_REPAIR_NODE_PADDING,
          aggregateMaxY + RESIDUAL_PARALLEL_LANE_GAP,
          aggregateMaxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
        ],
        companion.a.y,
      );
      for (const laneY of laneValues.slice(0, 10)) {
        if (Math.abs(laneY - companion.a.y) < OBSTACLE_REPAIR_NODE_PADDING) continue;
        const shiftedPath = shiftDisplayInternalSegment(companionPath, companion.segIdx, 'h', laneY);
        if (!shiftedPath) continue;
        const variant = edges.map((edge, edgeIndex) => (
          edgeIndex === companion.edgeIndex ? withDisplayComputedPath(edge, shiftedPath) : edge
        )) as T;
        variants.push(variant);
      }
    }

    if (primary.axis === 'h' && companion.axis === 'v') {
      const minX = Math.min(primary.a.x, primary.b.x);
      const maxX = Math.max(primary.a.x, primary.b.x);
      const minY = Math.min(companion.a.y, companion.b.y);
      const maxY = Math.max(companion.a.y, companion.b.y);
      const blockingHorizontalSpans = primaryPath
        .slice(0, -1)
        .map((point, segmentIndex) => ({
          start: point,
          end: primaryPath[segmentIndex + 1],
          axis: displayAxisOf(point, primaryPath[segmentIndex + 1]),
        }))
        .filter(segment => segment.axis === 'h')
        .filter(segment => segment.start.y > minY + 1 && segment.start.y < maxY - 1)
        .flatMap(segment => [segment.start.x, segment.end.x]);
      const aggregateMinX = blockingHorizontalSpans.length > 0 ? Math.min(...blockingHorizontalSpans) : minX;
      const aggregateMaxX = blockingHorizontalSpans.length > 0 ? Math.max(...blockingHorizontalSpans) : maxX;
      const laneValues = sortedUniqueNumbers(
        [
          minX - OBSTACLE_REPAIR_NODE_PADDING,
          minX - RESIDUAL_PARALLEL_LANE_GAP,
          minX - RESIDUAL_PARALLEL_LANE_GAP * 2,
          maxX + OBSTACLE_REPAIR_NODE_PADDING,
          maxX + RESIDUAL_PARALLEL_LANE_GAP,
          maxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
          aggregateMinX - OBSTACLE_REPAIR_NODE_PADDING,
          aggregateMinX - RESIDUAL_PARALLEL_LANE_GAP,
          aggregateMinX - RESIDUAL_PARALLEL_LANE_GAP * 2,
          aggregateMaxX + OBSTACLE_REPAIR_NODE_PADDING,
          aggregateMaxX + RESIDUAL_PARALLEL_LANE_GAP,
          aggregateMaxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
        ],
        companion.a.x,
      );
      for (const laneX of laneValues.slice(0, 10)) {
        if (Math.abs(laneX - companion.a.x) < OBSTACLE_REPAIR_NODE_PADDING) continue;
        const shiftedPath = shiftDisplayInternalSegment(companionPath, companion.segIdx, 'v', laneX);
        if (!shiftedPath) continue;
        const variant = edges.map((edge, edgeIndex) => (
          edgeIndex === companion.edgeIndex ? withDisplayComputedPath(edge, shiftedPath) : edge
        )) as T;
        variants.push(variant);
      }
    }
  }
  return variants;
};
