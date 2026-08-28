import type { Edge, Node } from '@xyflow/react';
import type { ElkLayoutRunner } from '../ports/elkLayoutExecutor';
import type { LayoutOptions } from './layout';

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
  ): Promise<{ nodes: Node[]; edges: Edge[] }> | { nodes: Node[]; edges: Edge[] };
  getName(): string;
  getDescription(): string;
  isApplicable(nodes: Node[], edges: Edge[]): boolean;
  getCategory(): 'hierarchy' | 'node';
}
