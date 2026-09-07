import type { Edge, Node } from '@xyflow/react';

import { layoutWithDagre } from './DomainDagreLayoutHelpers';
import { packDisconnectedDagreComponents } from './domainDagreComponentPacking';
import { validDomainDagreContentBudget, type DomainDagreContentBudget } from './domainDagreContentBudget';
import { domainDagreComponentIndexCovers, type DomainDagreComponentIndex } from './domainDagrePeerComponents';

export type DomainDagreNodeArrangement =
  | 'dagre'
  | 'flow'
  | 'grid'
  | 'horizontal'
  | 'vertical';

type NodeDimensions = (node: Node) => { width: number; height: number };
type ArrangedPosition = Readonly<{ id: string; x: number; y: number }>;

/** Select columns from measured geometry, not sqrt(node count). */
const chooseGridColumns = (
  nodes: readonly Node[],
  horizontalGap: number,
  verticalGap: number,
  getNodeDimensions: NodeDimensions,
  uniformCells: boolean,
  parentBudget?: DomainDagreContentBudget,
): number => {
  const fallback = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  if (nodes.length < 2 || nodes.length > 256) return fallback;
  const sizes = nodes.map(getNodeDimensions);
  if (![horizontalGap, verticalGap].every(value => Number.isFinite(value) && value >= 0 && value <= 5000)
    || sizes.some(size => ![size.width, size.height].every(value => Number.isFinite(value) && value > 0 && value <= 100_000))) return fallback;
  const maximumWidth = Math.max(...sizes.map(size => size.width));
  const maximumHeight = Math.max(...sizes.map(size => size.height));
  let bestColumns = fallback, bestFootprint = Infinity, bestArea = Infinity;
  // A mildly landscape content block is a product preference, not a hard
  // container ratio. Every candidate retains measured node sizes and gaps.
  const preferredAspectRatio = 1.6;
  const budget = validDomainDagreContentBudget(parentBudget) ? parentBudget : undefined;
  for (let columns = 1; columns <= nodes.length; columns++) {
    const rows = Math.ceil(nodes.length / columns);
    const widths = Array.from({ length: columns }, () => 0);
    const heights = Array.from({ length: rows }, () => 0);
    sizes.forEach((size, index) => {
      const column = index % columns, row = Math.floor(index / columns);
      widths[column] = Math.max(widths[column], uniformCells ? maximumWidth : size.width);
      heights[row] = Math.max(heights[row], uniformCells ? maximumHeight : size.height);
    });
    const width = widths.reduce((sum, value) => sum + value, 0) + horizontalGap * (columns - 1);
    const height = heights.reduce((sum, value) => sum + value, 0) + verticalGap * (rows - 1);
    if (budget && (width > budget.maxWidth + 0.5 || height > budget.maxHeight + 0.5)) continue;
    const footprint = budget ? budget.objective === 'width' ? width : height : Math.max(width / preferredAspectRatio, height);
    const area = width * height;
    if (footprint < bestFootprint - 0.5 || (Math.abs(footprint - bestFootprint) <= 0.5 && area < bestArea)) {
      bestColumns = columns;
      bestFootprint = footprint;
      bestArea = area;
    }
  }
  // An impossible parent envelope is not permission to shrink cards or return
  // a random column count. Retain the unconstrained geometry for outer sizing.
  return budget && !Number.isFinite(bestFootprint)
    ? chooseGridColumns(nodes, horizontalGap, verticalGap, getNodeDimensions, uniformCells)
    : bestColumns;
};

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
  packComponents = false,
  parentBudget?: DomainDagreContentBudget,
  globalComponentByNodeId?: DomainDagreComponentIndex,
): ArrangedPosition[] => {
  if (nodes.length === 0) return [];
  const ids = new Set(nodes.map(node => node.id));
  const componentSizes = new Map<number, number>();
  if (globalComponentByNodeId) for (const component of globalComponentByNodeId.values()) {
    componentSizes.set(component, (componentSizes.get(component) ?? 0) + 1);
  }
  // A missing projection is compatible with local callers. An explicitly
  // incomplete projection cannot prove independence, so retain local Dagre
  // geometry and let the packer reject the incomplete constraint set.
  const hasGlobalDependencies = globalComponentByNodeId !== undefined && (
    !domainDagreComponentIndexCovers(ids, globalComponentByNodeId)
    || nodes.some(node => {
      const component = globalComponentByNodeId.get(node.id);
      return component !== undefined && (componentSizes.get(component) ?? 0) > 1;
    })
  );
  const hasDependencies = hasGlobalDependencies
    || edges.some(edge => edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target));
  // A connected process is a rigid content block; grid/flow may arrange its
  // independent companions but never discard directed process ranks.
  if (arrangement === 'dagre' || ((arrangement === 'flow' || arrangement === 'grid') && hasDependencies)) {
    const positions = layoutWithDagre(
      [...nodes],
      [...edges],
      dagreIsHorizontal ? 'LR' : 'TB',
      dagreIsHorizontal ? verticalGap : horizontalGap,
      dagreIsHorizontal ? horizontalGap : verticalGap,
      getNodeDimensions,
    );
    return packComponents || arrangement !== 'dagre' ? [...packDisconnectedDagreComponents(
      positions, nodes, edges, horizontalGap, verticalGap, getNodeDimensions, parentBudget, globalComponentByNodeId,
    )] : positions;
  }
  if (arrangement === 'horizontal') {
    return gridPositions(nodes, nodes.length, horizontalGap, verticalGap, getNodeDimensions, false);
  }
  if (arrangement === 'vertical') {
    return gridPositions(nodes, 1, horizontalGap, verticalGap, getNodeDimensions, false);
  }
  const columns = chooseGridColumns(nodes, horizontalGap, verticalGap, getNodeDimensions, arrangement === 'grid', parentBudget);
  return gridPositions(
    nodes,
    columns,
    horizontalGap,
    verticalGap,
    getNodeDimensions,
    arrangement === 'grid',
  );
};
