import type { Position } from '../types/flow';

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PortCandidate {
  sourcePos: Position;
  targetPos: Position;
  estimatedCost: number;
  pathLength: number;
  bendCount: number;
  isValid: boolean;
  debugInfo?: unknown;
}
