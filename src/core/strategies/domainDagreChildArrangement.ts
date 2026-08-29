import type { Edge, Node } from '@xyflow/react';

import { layoutWithDagre } from './DomainDagreLayoutHelpers';

export type DomainDagreNodeArrangement =
  | 'dagre'
  | 'flow'
  | 'grid'
  | 'horizontal'
  | 'vertical';

type NodeDimensions = (node: Node) => { width: number; height: number };
type ArrangedPosition = Readonly<{ id: string; x: number; y: number }>;

const gridPositions = (
  nodes: readonly Node[],
  columns: number,
  horizontalGap: number,
  verticalGap: number,
  getNodeDimensions: NodeDimensions,
  uniformCells: boolean,
): ArrangedPosition[] => {
  const safeColumns = Math.max(1, Math.min(nodes.length || 1, Math.floor(columns)));
  const rows = Math.ceil(nodes.length / safeColumns);
  const widths = Array.from({ length: safeColumns }, () => 0);
  const heights = Array.from({ length: rows }, () => 0);

  nodes.forEach((node, index) => {
    const column = index % safeColumns;
    const row = Math.floor(index / safeColumns);
    const dimensions = getNodeDimensions(node);
    widths[column] = Math.max(widths[column] ?? 0, dimensions.width);
    heights[row] = Math.max(heights[row] ?? 0, dimensions.height);
  });
  if (uniformCells) {
    const width = Math.max(0, ...widths);
    const height = Math.max(0, ...heights);
    widths.fill(width);
    heights.fill(height);
  }

  const xOffsets: number[] = [];
  const yOffsets: number[] = [];
  let xCursor = 0;
  let yCursor = 0;
  widths.forEach((width, index) => {
    xOffsets.push(xCursor);
    xCursor += width + (index < widths.length - 1 ? horizontalGap : 0);
  });
  heights.forEach((height, index) => {
    yOffsets.push(yCursor);
    yCursor += height + (index < heights.length - 1 ? verticalGap : 0);
  });
  return nodes.map((node, index) => ({
    id: node.id,
    x: xOffsets[index % safeColumns] ?? 0,
    y: yOffsets[Math.floor(index / safeColumns)] ?? 0,
  }));
};

/**
 * Arranges the leaf nodes of one subdomain. Container placement remains owned
 * by DomainDagre; this function only provides local, origin-based positions.
 */
export const arrangeDomainDagreChildren = (
  nodes: readonly Node[],
  edges: readonly Edge[],
  arrangement: DomainDagreNodeArrangement,
  dagreIsHorizontal: boolean,
  horizontalGap: number,
  verticalGap: number,
  getNodeDimensions: NodeDimensions,
): ArrangedPosition[] => {
  if (nodes.length === 0) return [];
  if (arrangement === 'dagre') {
    return layoutWithDagre(
      [...nodes],
      [...edges],
      dagreIsHorizontal ? 'LR' : 'TB',
      dagreIsHorizontal ? verticalGap : horizontalGap,
      dagreIsHorizontal ? horizontalGap : verticalGap,
      getNodeDimensions,
    );
  }
  if (arrangement === 'horizontal') {
    return gridPositions(nodes, nodes.length, horizontalGap, verticalGap, getNodeDimensions, false);
  }
  if (arrangement === 'vertical') {
    return gridPositions(nodes, 1, horizontalGap, verticalGap, getNodeDimensions, false);
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  return gridPositions(
    nodes,
    columns,
    horizontalGap,
    verticalGap,
    getNodeDimensions,
    arrangement === 'grid',
  );
};
