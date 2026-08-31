import type { Edge, Node } from '@xyflow/react';
import { getNodeDimensions, layoutWithDagre } from './DomainDagreLayoutHelpers';
import { domainDagreDomainOf, isDomainDagreGroupNode, isDomainDagreNodeHidden } from './domainDagreHierarchy';
import { boundedDomainDagreNumber, getDomainDagreSubDomainOrderIndex,
  type DomainDagreDirection, type DomainDagreSubDomainOrder } from './domainDagreLayoutBoundary';

export interface SemanticLaneFlowOptions {
  direction: DomainDagreDirection;
  nodeToSubGroup?: ReadonlyMap<string, string>;
  domainOrder?: readonly string[];
  subDomainOrder?: DomainDagreSubDomainOrder;
  horizontalGap?: number;
  verticalGap?: number;
}

const withoutAbsolutePosition = (node: Node): Node => {
  const { positionAbsolute: _absolute, ...rest }: Node & { positionAbsolute?: Node['position'] } = node;
  return { ...rest, parentId: undefined, extent: undefined };
};

/** Shared process ranks and bounded per-peer corridors, before any edge routing. */
export const alignDomainDagreLaneFlow = (nodes: Node[], edges: Edge[], options: SemanticLaneFlowOptions): Node[] => {
  const { direction, nodeToSubGroup, domainOrder = [], subDomainOrder } = options;
  const horizontal = direction === 'LR' || direction === 'RL';
  const reversed = direction === 'BT' || direction === 'RL';
  const flow = horizontal ? 'x' : 'y';
  const cross = horizontal ? 'y' : 'x';
  const horizontalGap = boundedDomainDagreNumber(options.horizontalGap, 120, 120, 5000);
  const verticalGap = boundedDomainDagreNumber(options.verticalGap, 120, 120, 5000);
  const flowGap = horizontal ? horizontalGap : verticalGap;
  const crossGap = horizontal ? verticalGap : horizontalGap;
  const leaves = nodes.filter(node => !isDomainDagreGroupNode(node) && !isDomainDagreNodeHidden(node));
  if (leaves.length === 0) return nodes;
  if (leaves.some(node => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) {
    throw new Error('Semantic swimlane layout exceeds supported geometry bounds');
  }
  const globalPositions = new Map(layoutWithDagre(leaves, edges, horizontal ? 'LR' : 'TB', crossGap, flowGap)
    .map(position => [position.id, position]));
  const domains = nodes.filter(node => node.type === 'titleGroup' && !isDomainDagreNodeHidden(node));
  if (domains.length === 0) return nodes;
  const rank = (domain: Node) => Math.min(...leaves.filter(node => domainDagreDomainOf(node) === domainDagreDomainOf(domain))
    .map(node => globalPositions.get(node.id)?.[flow] ?? Infinity));
  const explicitRank = new Map(domainOrder.map((key, index) => [key, index]));
  const orderedDomains = domains.toSorted((a, b) =>
    (explicitRank.get(domainDagreDomainOf(a)) ?? Number.MAX_SAFE_INTEGER)
    - (explicitRank.get(domainDagreDomainOf(b)) ?? Number.MAX_SAFE_INTEGER) || rank(a) - rank(b));
  const originals = new Map(nodes.map(node => [node.id, node]));
  const replacements = new Map<string, Node>();
  const at = (c: number, f: number) => horizontal ? { x: f, y: c } : { x: c, y: f };
  const flowSize = (node: Node) => horizontal ? getNodeDimensions(node).width : getNodeDimensions(node).height;
  const crossSize = (node: Node) => horizontal ? getNodeDimensions(node).height : getNodeDimensions(node).width;
  const resize = (node: Node, c: number, f: number, cSize: number, fSize: number): Node => {
    const width = horizontal ? fSize : cSize;
    const height = horizontal ? cSize : fSize;
    return { ...withoutAbsolutePosition(node), position: at(c, f), width, height,
      measured: { width, height }, style: { ...node.style, width, height } };
  };
  const flowEnd = Math.max(...leaves.map(node => (globalPositions.get(node.id)?.[flow] ?? 0) + flowSize(node))) + 232;
  let domainCross = 0;
  for (const domain of orderedDomains) {
    const members = leaves.filter(node => domainDagreDomainOf(node) === domainDagreDomainOf(domain));
    const buckets = new Map<string, Node[]>();
    for (const node of members) {
      const parent = originals.get(nodeToSubGroup?.get(node.id) ?? node.parentId ?? '');
      const key = parent?.type === 'subGroup' ? parent.id : domain.id;
      const bucket = buckets.get(key) ?? [];
      bucket.push(node);
      buckets.set(key, bucket);
    }
    let bucketCross = domainCross + (horizontal ? 88 : 32);
    const orderedBuckets = [...buckets].sort(([a], [b]) =>
      getDomainDagreSubDomainOrderIndex(subDomainOrder, domainDagreDomainOf(domain), originals.get(a)?.data.subDomain)
      - getDomainDagreSubDomainOrderIndex(subDomainOrder, domainDagreDomainOf(domain), originals.get(b)?.data.subDomain));
    for (const [id, bucket] of orderedBuckets) {
      const minCross = Math.min(...bucket.map(node => node.position[cross]));
      const maxCross = Math.max(...bucket.map(node => node.position[cross] + crossSize(node)));
      const inset = horizontal ? 64 : 32;
      const width = maxCross - minCross + inset + 32;
      for (const node of bucket) {
        const leaf = withoutAbsolutePosition(node);
        replacements.set(node.id, { ...leaf, position: at(bucketCross + inset + node.position[cross] - minCross,
          200 + (globalPositions.get(node.id)?.[flow] ?? 0)) });
      }
      const group = originals.get(id);
      if (group && id !== domain.id) {
        const { parentId: _parent, extent: _extent, ...container } = group;
        replacements.set(id, resize(container, bucketCross, 88, width, flowEnd - 120));
      }
      bucketCross += width + crossGap;
    }
    const width = Math.max(128, bucketCross - domainCross - crossGap + 32);
    replacements.set(domain.id, resize(domain, domainCross, 0, width, flowEnd));
    domainCross += width + crossGap;
  }
  // Ungrouped visible nodes participate in the same global process ranks.
  for (const node of leaves) {
    if (replacements.has(node.id)) continue;
    replacements.set(node.id, { ...withoutAbsolutePosition(node),
      position: at(domainCross, 200 + (globalPositions.get(node.id)?.[flow] ?? 0)) });
    domainCross += crossSize(node) + crossGap;
  }
  const layers = new Map<string, Node[]>();
  for (const node of leaves) {
    const rankCenter = (globalPositions.get(node.id)?.[flow] ?? 0) + flowSize(node) / 2;
    const key = JSON.stringify([nodeToSubGroup?.get(node.id) ?? node.parentId ?? domainDagreDomainOf(node), rankCenter]);
    const layer = layers.get(key) ?? [];
    layer.push(node);
    layers.set(key, layer);
  }
  const neighbors = new Map<string, string[]>();
  for (const edge of edges) {
    neighbors.set(edge.source, [...(neighbors.get(edge.source) ?? []), edge.target]);
    neighbors.set(edge.target, [...(neighbors.get(edge.target) ?? []), edge.source]);
  }
  const center = (node: Node) => node.position[cross] + crossSize(node) / 2;
  // Local-only branch ordering cannot see a target in an adjacent domain.
  // Keep ranks and lane bounds, but order peers using all incident endpoints.
  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (const layer of layers.values()) {
      const slots = layer.map(node => center(replacements.get(node.id) ?? node)).sort((a, b) => a - b);
      const barycenter = (node: Node) => {
        const adjacent = (neighbors.get(node.id) ?? []).flatMap(id => {
          const neighbor = replacements.get(id);
          return neighbor ? [center(neighbor)] : [];
        });
        return adjacent.length ? adjacent.reduce((sum, value) => sum + value, 0) / adjacent.length : center(node);
      };
      const ordered = layer.toSorted((a, b) => barycenter(a) - barycenter(b));
      ordered.forEach((node, index) => {
        const current = replacements.get(node.id) ?? node;
        replacements.set(node.id, { ...current, position: { ...current.position, [cross]: slots[index] - crossSize(current) / 2 } });
      });
    }
  }
  // Reserve distinct flow corridors for peers instead of forcing every
  // independent branch and cross-domain merge through the same rank gap.
  const flowRanks = new Map<number, Node[]>();
  for (const node of leaves) {
    const rankCenter = (globalPositions.get(node.id)?.[flow] ?? 0) + flowSize(node) / 2;
    const peers = flowRanks.get(rankCenter) ?? [];
    peers.push(node);
    flowRanks.set(rankCenter, peers);
  }
  let flowOffset = 0;
  for (const [, peers] of [...flowRanks].sort(([a], [b]) => a - b)) {
    const ordered = peers.toSorted((a, b) => center(replacements.get(a.id) ?? a) - center(replacements.get(b.id) ?? b));
    ordered.forEach((node, index) => {
      const current = replacements.get(node.id) ?? node;
      replacements.set(node.id, { ...current, position: { ...current.position, [flow]: current.position[flow] + flowOffset + index * flowGap } });
    });
    flowOffset += Math.max(0, ordered.length - 1) * flowGap;
  }
  for (const node of replacements.values()) {
    if (!isDomainDagreGroupNode(node)) continue;
    replacements.set(node.id, resize(node, node.position[cross], node.position[flow], crossSize(node), flowSize(node) + flowOffset));
  }
  if (reversed) {
    const visible = leaves.map(node => replacements.get(node.id) ?? node);
    const mirror = Math.min(...visible.map(node => node.position[flow]))
      + Math.max(...visible.map(node => node.position[flow] + flowSize(node)));
    for (const node of visible) {
      replacements.set(node.id, { ...node, position: { ...node.position, [flow]: mirror - node.position[flow] - flowSize(node) } });
    }
  }
  if ([...replacements.values()].some(node => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)
    || Math.abs(node.position.x) + getNodeDimensions(node).width > 1_000_000
    || Math.abs(node.position.y) + getNodeDimensions(node).height > 1_000_000)) {
    throw new Error('Semantic swimlane layout exceeds supported geometry bounds');
  }
  return nodes.map(node => replacements.get(node.id) ?? node);
};
