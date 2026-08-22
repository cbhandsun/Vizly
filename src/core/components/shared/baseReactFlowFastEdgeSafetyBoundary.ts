import type { Node, XYPosition } from '@xyflow/react';

export type FastPoint = { x: number; y: number };
export type FastRect = { id: string; x: number; y: number; width: number; height: number };

export type DisplayNode = Node & {
  positionAbsolute?: XYPosition;
  measured?: { width?: number; height?: number };
};

export const finiteNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
