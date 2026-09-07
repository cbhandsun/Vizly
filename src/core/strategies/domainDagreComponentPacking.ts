import type { Edge, Node } from '@xyflow/react';
import {
  domainDagreComponentIndexCovers,
  domainDagrePeerComponentIndex,
  type DomainDagreComponentIndex,
} from './domainDagrePeerComponents';
import { validDomainDagreContentBudget, type DomainDagreContentBudget } from './domainDagreContentBudget';

type Position = Readonly<{ id: string; x: number; y: number }>;
type Dimensions = (node: Node) => { width: number; height: number };
type Block = { positions: Position[]; x: number; y: number; width: number; height: number };

/**
 * Pack disconnected local graphs as rigid rectangles. Their internal ranks,
 * branch order and spacing remain Dagre-owned. Only accept a smaller bounding
 * area; an aspect-ratio tie-break avoids an unnecessarily long strip. This is
 * for content-sized groups, never for ordered swimlanes.
 */
export function packDisconnectedDagreComponents(
  positions: readonly Position[],
  nodes: readonly Node[],
  edges: readonly Edge[],
  horizontalGap: number,
  verticalGap: number,
  dimensions: Dimensions,
  parentBudget?: DomainDagreContentBudget,
  globalComponentByNodeId?: DomainDagreComponentIndex,
): readonly Position[] {
  if (nodes.length < 2 || nodes.length > 256 || positions.length !== nodes.length
    || ![horizontalGap, verticalGap].every(value => Number.isFinite(value) && value >= 0 && value <= 5000)) return positions;
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length || new Set(positions.map(position => position.id)).size !== nodes.length) return positions;
  const sizes = new Map(nodes.map(node => [node.id, dimensions(node)]));
  if (positions.some(position => !byId.has(position.id)
    || ![position.x, position.y].every(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000))
    || [...sizes.values()].some(size => ![size.width, size.height].every(value => Number.isFinite(value) && value > 0 && value <= 100_000))) return positions;
  // Local edge filtering must not turn nodes linked through another domain
  // into independent cards. Preserve their relative Dagre coordinates as one
  // rigid block; only genuinely disconnected components may be packed apart.
  if (globalComponentByNodeId && !domainDagreComponentIndexCovers(byId.keys(), globalComponentByNodeId)) return positions;
  const componentById = globalComponentByNodeId ?? domainDagrePeerComponentIndex(byId.keys(), edges);
  const components = new Map<number, Position[]>();
  for (const position of positions) {
    const component = componentById.get(position.id);
    if (component === undefined) return positions;
    const members = components.get(component) ?? [];
    members.push(position);
    components.set(component, members);
  }
  if (components.size < 2) return positions;
  const bounds = (members: readonly Position[]) => {
    const x = Math.min(...members.map(position => position.x));
    const y = Math.min(...members.map(position => position.y));
    return { x, y,
      width: Math.max(...members.map(position => position.x + (sizes.get(position.id)?.width ?? 0))) - x,
      height: Math.max(...members.map(position => position.y + (sizes.get(position.id)?.height ?? 0))) - y };
  };
  const blocks: Block[] = [...components.values()].map(members => ({ positions: members, ...bounds(members) }))
    .sort((a, b) => b.height - a.height || b.width - a.width);
  const original = bounds(positions);
  const budget = validDomainDagreContentBudget(parentBudget) ? parentBudget : undefined;
  let bestObjective = budget ? original[budget.objective] : Infinity;
  let bestArea = original.width * original.height;
  let bestSpan = Math.max(original.width, original.height);
  let best: readonly Position[] = positions;
  // Try both row shelves and column shelves: short components can then fill
  // the empty space beside a tall connected flow, or below a wide one.
  for (const rotated of [false, true]) {
    const packedBlocks = blocks.map(block => ({ ...block,
      width: rotated ? block.height : block.width,
      height: rotated ? block.width : block.height,
    })).sort((a, b) => b.height - a.height || b.width - a.width);
    const gapX = rotated ? verticalGap : horizontalGap;
    const gapY = rotated ? horizontalGap : verticalGap;
    const originalWidth = rotated ? budget?.maxHeight ?? original.height : budget?.maxWidth ?? original.width;
    const originalHeight = rotated ? budget?.maxWidth ?? original.width : budget?.maxHeight ?? original.height;
    const widest = Math.max(...packedBlocks.map(block => block.width));
    const widths = new Set([widest, originalWidth]);
    let cumulativeWidth = 0;
    for (const block of packedBlocks) {
      cumulativeWidth += block.width + (cumulativeWidth ? gapX : 0);
      if (cumulativeWidth <= originalWidth) widths.add(Math.max(widest, cumulativeWidth));
    }
    for (const targetWidth of widths) {
      let x = 0, y = 0, rowHeight = 0, width = 0;
      const candidate: Position[] = [];
      for (const block of packedBlocks) {
        if (x > 0 && x + block.width > targetWidth + 0.5) {
          x = 0;
          y += rowHeight + gapY;
          rowHeight = 0;
        }
        for (const position of block.positions) candidate.push({ id: position.id,
          x: original.x + (rotated ? y : x) + position.x - block.x,
          y: original.y + (rotated ? x : y) + position.y - block.y });
        width = Math.max(width, x + block.width);
        rowHeight = Math.max(rowHeight, block.height);
        x += block.width + gapX;
      }
      const height = y + rowHeight;
      // A local area win must not lengthen a parent flow or widen its rank.
      if (width > originalWidth + 0.5 || height > originalHeight + 0.5) continue;
      const area = width * height, span = Math.max(width, height);
      const objective = budget?.objective === 'width' ? rotated ? height : width : rotated ? width : height;
      const improves = budget
        ? objective < bestObjective - 0.5 || (Math.abs(objective - bestObjective) <= 0.5 && area < bestArea - 0.5)
        : area < bestArea - 0.5 || (Math.abs(area - bestArea) <= 0.5 && span < bestSpan - 0.5);
      if (improves) {
        bestObjective = objective;
        bestArea = area;
        bestSpan = span;
        const candidateById = new Map(candidate.map(position => [position.id, position]));
        best = positions.map(position => candidateById.get(position.id) ?? position);
      }
    }
  }
  return best;
}
