import type { Node } from '@xyflow/react';
import { getNodeDimensions } from './DomainDagreLayoutHelpers';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from './shared/edgeBusinessNodeClearanceRepair';

type Axis = 'x' | 'y';
type Position = Readonly<{ x: number; y: number }>;

/**
 * Coordinate assignment after global ranking. Local Dagre coordinates can
 * reserve different columns for nodes which the final ranks place far apart.
 * A separation-constraint DAG lets those nodes reuse space, while preserving
 * the order and clearance of every pair that shares a process band. Averaging
 * the left-tight and right-tight solutions centers unconstrained chains.
 * No rank, node size, lane membership or routing clearance is changed.
 */
export function compactDomainDagreLaneCrossAxis(
  nodes: readonly Node[],
  rankedPositions: ReadonlyMap<string, Position>,
  crossAxis: Axis,
  crossGap: number,
): ReadonlyMap<string, number> {
  const unchanged = new Map(nodes.map(node => [node.id, node.position[crossAxis]]));
  // Quadratic constraints are bounded independently of the overall graph size.
  if (nodes.length < 2 || nodes.length > 256 || unchanged.size !== nodes.length
    || !Number.isFinite(crossGap) || crossGap < 0 || crossGap > 5000) return unchanged;
  const flowAxis = crossAxis === 'x' ? 'y' : 'x';
  const dimension = crossAxis === 'x' ? 'width' : 'height';
  const flowDimension = crossAxis === 'x' ? 'height' : 'width';
  const items = nodes.map(node => ({
    id: node.id,
    cross: node.position[crossAxis],
    flow: rankedPositions.get(node.id)?.[flowAxis],
    size: getNodeDimensions(node)[dimension],
    flowSize: getNodeDimensions(node)[flowDimension],
  })).sort((a, b) => a.cross - b.cross);
  if (items.some(item => item.flow === undefined
    || ![item.cross, item.flow, item.size, item.flowSize].every(value =>
      typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000))) return unchanged;
  const predecessors: { index: number; distance: number }[][] = items.map(() => []);
  const successors: { index: number; distance: number }[][] = items.map(() => []);
  for (let right = 1; right < items.length; right++) {
    const b = items[right];
    for (let left = 0; left < right; left++) {
      const a = items[left];
      if (a.flow === undefined || b.flow === undefined) return unchanged;
      const flowSeparation = Math.max(b.flow - a.flow - a.flowSize, a.flow - b.flow - b.flowSize);
      if (flowSeparation >= COMMERCIAL_BUSINESS_NODE_CLEARANCE) continue;
      const oldGap = b.cross - a.cross - a.size;
      // Compaction is not an overlap-removal policy. Invalid starting bands
      // stay with the existing layout/routing validation path.
      if (oldGap < 0) return unchanged;
      const distance = a.size + Math.min(oldGap, Math.max(crossGap, COMMERCIAL_BUSINESS_NODE_CLEARANCE));
      predecessors[right].push({ index: left, distance });
      successors[left].push({ index: right, distance });
    }
  }
  const leftPositions = items.map(() => 0);
  for (let index = 0; index < items.length; index++) {
    for (const constraint of predecessors[index]) {
      leftPositions[index] = Math.max(leftPositions[index], leftPositions[constraint.index] + constraint.distance);
    }
  }
  const origin = Math.min(...items.map(item => item.cross));
  const previousWidth = Math.max(...items.map(item => item.cross + item.size)) - origin;
  const width = Math.max(...items.map((item, index) => leftPositions[index] + item.size));
  if (width >= previousWidth - 0.5) return unchanged;
  const rightPositions = items.map(item => width - item.size);
  for (let index = items.length - 1; index >= 0; index--) {
    for (const constraint of successors[index]) {
      rightPositions[index] = Math.min(rightPositions[index], rightPositions[constraint.index] - constraint.distance);
    }
  }
  return new Map(items.map((item, index) => [item.id, origin + (leftPositions[index] + rightPositions[index]) / 2]));
}
