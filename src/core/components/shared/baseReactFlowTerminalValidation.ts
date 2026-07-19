import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  boundarySideFromTerminalEndpoint,
  expectedTerminalAxis,
  fixedTerminalHandleSide,
  MAX_RENDERED_FILLET_TRANSITION,
  readTerminalEdgePath,
  readTerminalNodeRect,
  TERMINAL_ATTACHMENT_TOLERANCE,
  terminalAxisOf,
  terminalCoordinateIsOutward,
  TERMINAL_EPSILON,
  type TerminalPoint,
  type TerminalRect,
  type TerminalHandleSide,
} from './baseReactFlowTerminalGeometry';

const endpointDirectionsMatchNodes = (
  edge: Edge,
  path: TerminalPoint[],
  nodeRects: Map<string, TerminalRect>,
  allowRenderedFilletTransitions = false,
): boolean => {
  if (path.length < 2) return false;
  const source = path[0];
  const target = path[path.length - 1];
  const sourceRect = nodeRects.get(edge.source);
  const targetRect = nodeRects.get(edge.target);
  const declaredSourceSide = fixedTerminalHandleSide(edge, 'source');
  const declaredTargetSide = fixedTerminalHandleSide(edge, 'target');
  const hintedSourceSide = normalizeHandle(edge.sourceHandle);
  const hintedTargetSide = normalizeHandle(edge.targetHandle);
  const endpointLiesOnSide = (
    point: TerminalPoint,
    rect: TerminalRect | undefined,
    side: TerminalHandleSide,
  ): boolean => {
    if (!rect) return false;
    const withinX = point.x >= rect.x - TERMINAL_ATTACHMENT_TOLERANCE
      && point.x <= rect.x + rect.width + TERMINAL_ATTACHMENT_TOLERANCE;
    const withinY = point.y >= rect.y - TERMINAL_ATTACHMENT_TOLERANCE
      && point.y <= rect.y + rect.height + TERMINAL_ATTACHMENT_TOLERANCE;
    if (side === 't') return withinX && Math.abs(point.y - rect.y) <= TERMINAL_ATTACHMENT_TOLERANCE;
    if (side === 'b') {
      return withinX
        && Math.abs(point.y - (rect.y + rect.height)) <= TERMINAL_ATTACHMENT_TOLERANCE;
    }
    if (side === 'l') return withinY && Math.abs(point.x - rect.x) <= TERMINAL_ATTACHMENT_TOLERANCE;
    return withinY
      && Math.abs(point.x - (rect.x + rect.width)) <= TERMINAL_ATTACHMENT_TOLERANCE;
  };
  // A corner belongs to two geometric sides. A declared handle disambiguates
  // the intended port hemisphere; boundary detection remains the auto-port fallback.
  const sourceSide = hintedSourceSide && endpointLiesOnSide(source, sourceRect, hintedSourceSide)
    ? hintedSourceSide
    : boundarySideFromTerminalEndpoint(source, sourceRect);
  const targetSide = hintedTargetSide && endpointLiesOnSide(target, targetRect, hintedTargetSide)
    ? hintedTargetSide
    : boundarySideFromTerminalEndpoint(target, targetRect);
  if (!sourceSide || !targetSide) return false;
  if (declaredSourceSide && declaredSourceSide !== sourceSide) return false;
  if (declaredTargetSide && declaredTargetSide !== targetSide) return false;

  const terminalEscapesOutward = (
    orderedPath: TerminalPoint[],
    side: TerminalHandleSide,
    rect: TerminalRect | undefined,
    allowBoundaryTrunk: boolean,
  ): boolean => {
    const [terminal, adjacent, next, afterNext] = orderedPath;
    if (!terminal || !adjacent) return false;
    const outwardAxis = expectedTerminalAxis(side);
    const firstAxis = terminalAxisOf(terminal, adjacent);
    if (firstAxis === outwardAxis) {
      const coordinate = side === 't' || side === 'b' ? adjacent.y : adjacent.x;
      return terminalCoordinateIsOutward(coordinate, terminal, side);
    }
    if (!allowBoundaryTrunk || !rect || !next || !firstAxis || firstAxis === outwardAxis) return false;
    const adjacentStaysOnBoundary = side === 't'
      ? Math.abs(adjacent.y - rect.y) <= 3
      : side === 'b'
        ? Math.abs(adjacent.y - (rect.y + rect.height)) <= 3
        : side === 'l'
          ? Math.abs(adjacent.x - rect.x) <= 3
          : Math.abs(adjacent.x - (rect.x + rect.width)) <= 3;
    if (!adjacentStaysOnBoundary) return false;
    let outwardPoint = next;
    if (terminalAxisOf(adjacent, next) !== outwardAxis) {
      const transitionDx = Math.abs(next.x - adjacent.x);
      const transitionDy = Math.abs(next.y - adjacent.y);
      const transitionMovesOutward = side === 't'
        ? next.y < adjacent.y
        : side === 'b'
          ? next.y > adjacent.y
          : side === 'l'
            ? next.x < adjacent.x
            : next.x > adjacent.x;
      const isBoundedRenderedFillet = allowRenderedFilletTransitions
        && Boolean(afterNext)
        && terminalAxisOf(adjacent, next) === null
        && terminalAxisOf(next, afterNext) === outwardAxis
        && transitionDx > TERMINAL_EPSILON
        && transitionDy > TERMINAL_EPSILON
        && transitionDx <= MAX_RENDERED_FILLET_TRANSITION
        && transitionDy <= MAX_RENDERED_FILLET_TRANSITION
        && transitionMovesOutward;
      if (!isBoundedRenderedFillet || !afterNext) return false;
      outwardPoint = afterNext;
    }
    const coordinate = side === 't' || side === 'b' ? outwardPoint.y : outwardPoint.x;
    return terminalCoordinateIsOutward(coordinate, adjacent, side);
  };

  return terminalEscapesOutward(path, sourceSide, sourceRect, !declaredSourceSide)
    && terminalEscapesOutward([...path].reverse(), targetSide, targetRect, !declaredTargetSide);
};

export type DisplayTerminalValidation = {
  attached: boolean;
  anchored: boolean;
};

export type DisplayTerminalValidationSnapshot = {
  validateEdge: (edge: Edge) => DisplayTerminalValidation;
};

export type DisplayTerminalValidationOptions = {
  allowRenderedFilletTransitions?: boolean;
};

export type DisplayTerminalValidationReport = {
  allAttached: boolean;
  allAnchored: boolean;
  unanchoredEdgeIndexes: number[];
};

export const createDisplayTerminalValidationSnapshot = (
  nodes: Node[],
  options: DisplayTerminalValidationOptions = {},
): DisplayTerminalValidationSnapshot => {
  const nodeRects = new Map<string, TerminalRect>();
  for (const node of nodes) {
    const rect = readTerminalNodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }

  return {
    validateEdge: (edge) => {
      const path = readTerminalEdgePath(edge);
      const anchored = endpointDirectionsMatchNodes(
        edge,
        path,
        nodeRects,
        options.allowRenderedFilletTransitions === true,
      );
      if (anchored) return { attached: true, anchored: true };
      if (path.length < 2) return { attached: false, anchored: false };
      return {
        attached: Boolean(
          boundarySideFromTerminalEndpoint(path[0], nodeRects.get(edge.source))
          && boundarySideFromTerminalEndpoint(path[path.length - 1], nodeRects.get(edge.target))
        ),
        anchored: false,
      };
    },
  };
};

export const getDisplayTerminalValidationReport = (
  edges: readonly Edge[],
  snapshot: DisplayTerminalValidationSnapshot,
): DisplayTerminalValidationReport => {
  let allAttached = true;
  const unanchoredEdgeIndexes: number[] = [];
  edges.forEach((edge, index) => {
    const validation = snapshot.validateEdge(edge);
    if (!validation.attached) allAttached = false;
    if (!validation.anchored) unanchoredEdgeIndexes.push(index);
  });
  return {
    allAttached,
    allAnchored: unanchoredEdgeIndexes.length === 0,
    unanchoredEdgeIndexes,
  };
};

export const displayEdgesHaveNodeAnchoredTerminals = (
  edges: Edge[],
  nodes: Node[],
  options: DisplayTerminalValidationOptions = {},
): boolean => {
  const snapshot = createDisplayTerminalValidationSnapshot(nodes, options);
  return getDisplayTerminalValidationReport(edges, snapshot).allAnchored;
};

export const displayEdgesHaveNodeAttachedTerminals = (
  edges: Edge[],
  nodes: Node[],
): boolean => {
  const snapshot = createDisplayTerminalValidationSnapshot(nodes);
  return getDisplayTerminalValidationReport(edges, snapshot).allAttached;
};

export const keepNodeAnchoredTerminalCandidates = (
  candidates: Edge[],
  baseline: Edge[],
  nodes: Node[],
): Edge[] => {
  const nodeRects = new Map<string, TerminalRect>();
  for (const node of nodes) {
    const rect = readTerminalNodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }
  return candidates.map((edge, index) => {
    const path = readTerminalEdgePath(edge);
    return endpointDirectionsMatchNodes(edge, path, nodeRects)
      ? edge
      : baseline[index] ?? edge;
  });
};
