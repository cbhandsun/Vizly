import type { Edge, Node } from '@xyflow/react';
import type { ElkLayoutRunner } from '../ports/elkLayoutExecutor';
import type { LayoutOptions } from './layout';
import type { LaneRankDecision } from './domainLaneRank';

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  metadata?: { laneRankDecision?: LaneRankDecision };
}

export interface LayoutCalculationContext {
  elkLayoutRunner?: ElkLayoutRunner;
  signal?: AbortSignal;
}

/** Strategy contract kept independent from the concrete strategy registry. */
export interface ILayoutStrategy {
  calculateLayout(
    nodes: Node[],
    edges: Edge[],
    options?: LayoutOptions,
    context?: LayoutCalculationContext,
  ): Promise<LayoutResult> | LayoutResult;
  getName(): string;
  getDescription(): string;
  isApplicable(nodes: Node[], edges: Edge[]): boolean;
  getCategory(): 'hierarchy' | 'node';
}
