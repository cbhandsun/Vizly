import type { Edge, Node } from '@xyflow/react';

import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';

export type TerminalPoint = { x: number; y: number };
export type TerminalAxis = 'h' | 'v';
export type TerminalHandleSide = 't' | 'b' | 'l' | 'r';
export type TerminalRect = { x: number; y: number; width: number; height: number };

export const TERMINAL_EPSILON = 0.5;
export const TERMINAL_ATTACHMENT_TOLERANCE = 1.5;
export const MAX_RENDERED_FILLET_TRANSITION = 24;
export const MIN_TERMINAL_STUB = 48;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const finite = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const parseFiniteCoordinate = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const expectedTerminalAxis = (side: TerminalHandleSide | null): TerminalAxis | null => (
  side === 't' || side === 'b' ? 'v' : side === 'l' || side === 'r' ? 'h' : null
);

export const fixedTerminalHandleSide = (
  edge: Edge,
  role: 'source' | 'target',
): TerminalHandleSide | null => {
  const policy = readEdgeTerminalPolicy(edge, role);
  return policy.sideFixed ? normalizeHandle(edge[`${role}Handle`]) ?? null : null;
};

export const terminalAxisOf = (
  first: TerminalPoint,
  second: TerminalPoint,
): TerminalAxis | null => {
  if (
    Math.abs(first.y - second.y) <= TERMINAL_EPSILON
    && Math.abs(first.x - second.x) > TERMINAL_EPSILON
  ) return 'h';
  if (
    Math.abs(first.x - second.x) <= TERMINAL_EPSILON
    && Math.abs(first.y - second.y) > TERMINAL_EPSILON
  ) return 'v';
  return null;
};

export const readTerminalEdgePath = (edge: Edge): TerminalPoint[] => {
  const data = isRecord(edge.data) ? edge.data : {};
  const treeRouting = isRecord(data.treeRouting) ? data.treeRouting : {};
  const raw = Array.isArray(data.computedPath)
    ? data.computedPath
    : Array.isArray(treeRouting.points)
      ? treeRouting.points
      : [];
  const path: TerminalPoint[] = [];
  for (const candidate of raw) {
    if (!isRecord(candidate)) continue;
    const x = parseFiniteCoordinate(candidate.x);
    const y = parseFiniteCoordinate(candidate.y);
    if (x !== null && y !== null) path.push({ x, y });
  }
  return path;
};

export const readTerminalNodeRect = (node: Node): TerminalRect | null => {
  const nodeRecord = node as Node & {
    positionAbsolute?: unknown;
    measured?: { width?: unknown; height?: unknown };
  };
  const position = isRecord(nodeRecord.positionAbsolute)
    ? nodeRecord.positionAbsolute
    : isRecord(node.position)
      ? node.position
      : null;
  const style = isRecord(node.style) ? node.style : {};
  const width = finite(nodeRecord.measured?.width ?? node.width ?? style.width);
  const height = finite(nodeRecord.measured?.height ?? node.height ?? style.height);
  if (!position || width <= 1 || height <= 1) return null;
  return { x: finite(position.x), y: finite(position.y), width, height };
};

export const boundarySideFromTerminalEndpoint = (
  point: TerminalPoint,
  rect: TerminalRect | undefined,
): TerminalHandleSide | null => {
  if (!rect) return null;
  const withinX = point.x >= rect.x - TERMINAL_ATTACHMENT_TOLERANCE
    && point.x <= rect.x + rect.width + TERMINAL_ATTACHMENT_TOLERANCE;
  const withinY = point.y >= rect.y - TERMINAL_ATTACHMENT_TOLERANCE
    && point.y <= rect.y + rect.height + TERMINAL_ATTACHMENT_TOLERANCE;
  if (withinX && Math.abs(point.y - rect.y) <= TERMINAL_ATTACHMENT_TOLERANCE) return 't';
  if (
    withinX
    && Math.abs(point.y - (rect.y + rect.height)) <= TERMINAL_ATTACHMENT_TOLERANCE
  ) return 'b';
  if (withinY && Math.abs(point.x - rect.x) <= TERMINAL_ATTACHMENT_TOLERANCE) return 'l';
  if (
    withinY
    && Math.abs(point.x - (rect.x + rect.width)) <= TERMINAL_ATTACHMENT_TOLERANCE
  ) return 'r';
  return null;
};

export const terminalCoordinateIsOutward = (
  coordinate: number,
  point: TerminalPoint,
  side: TerminalHandleSide,
): boolean => {
  if (side === 't') return coordinate <= point.y - MIN_TERMINAL_STUB;
  if (side === 'b') return coordinate >= point.y + MIN_TERMINAL_STUB;
  if (side === 'l') return coordinate <= point.x - MIN_TERMINAL_STUB;
  return coordinate >= point.x + MIN_TERMINAL_STUB;
};
