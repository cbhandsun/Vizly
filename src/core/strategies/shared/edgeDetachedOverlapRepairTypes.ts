import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import type { Point, Rect } from './edgeDetachedOverlapCandidates';

export type RoutingObstacleGate = (
  baselinePaths: Point[][],
  candidatePaths: Point[][],
  changedIndexes: readonly number[],
) => boolean;

export interface StrictCrossingMazeContext {
  /**
   * Full-graph paths used only when scoring candidate segments. Keeping these
   * separate from the local coordinate seed prevents large diagrams from
   * exploding the bounded maze grid while still accounting for remote edges
   * that cross the local search window.
   */
  penaltyPaths: Point[][];
  penaltyEdges: Edge[];
  penaltyEdgeIndex: number;
  /** Nodes whose boundaries should contribute candidate grid coordinates. */
  gridNodes?: ReactFlowNode[];
  /** Optional caller-owned object populated without logging route contents. */
  diagnostics?: StrictCrossingMazeDiagnostics;
}

export type StrictCrossingMazeResultReason =
  | 'candidate'
  | 'invalid'
  | 'grid-budget'
  | 'no-route'
  | 'same-path';

export interface StrictCrossingMazeDiagnostics {
  reason?: StrictCrossingMazeResultReason;
  xCoordinateCount?: number;
  yCoordinateCount?: number;
  gridCellCount?: number;
}

export interface DetachedParallelOverlapRepairOptions {
  maxIterations?: number;
  maxHitBudget?: number;
  maxQualityEvaluations?: number;
  maxResidualPasses?: number;
  qualityOnly?: boolean;
}
