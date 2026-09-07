import type { Edge, Node } from '@xyflow/react';
import type { LaneRankMode } from '../types/domainLaneRank';
import { getNodeDimensions, layoutWithDagre } from './DomainDagreLayoutHelpers';
import { domainDagreDomainOf, isDomainDagreGroupNode, isDomainDagreNodeHidden } from './domainDagreHierarchy';
import { domainDagrePeerComponentIndex } from './domainDagrePeerComponents';
import { compactDomainDagreLaneCrossAxis } from './domainDagreLaneCrossCompaction';
import { assignDomainDagreLaneCoordinates, type DomainDagreLaneCoordinateScope } from './domainDagreLaneCoordinateAssignment';
import { boundedDomainDagreNumber, getDomainDagreSubDomainOrderIndex,
  type DomainDagreDirection, type DomainDagreSubDomainOrder } from './domainDagreLayoutBoundary';

export interface SemanticLaneFlowOptions {
  rankMode?: LaneRankMode;
  direction: DomainDagreDirection;
  nodeToSubGroup?: ReadonlyMap<string, string>;
  domainOrder?: readonly string[];
  subDomainOrder?: DomainDagreSubDomainOrder;
  horizontalGap?: number;
  verticalGap?: number;
  independentNodeArrangement?: 'grid' | 'flow';
}

const withoutAbsolutePosition = (node: Node): Node => {
  const { positionAbsolute: _absolute, ...rest }: Node & { positionAbsolute?: Node['position'] } = node;
  return { ...rest, parentId: undefined, extent: undefined };
};

const moveAlong = (node: Node, axis: 'x' | 'y', value: number): Node => ({
  ...node, position: { ...node.position, [axis]: value },
});
const appendGrouped = <K, V>(groups: Map<K, V[]>, key: K, value: V): void => {
  groups.set(key, [...(groups.get(key) ?? []), value]);
};
export class SemanticLaneGeometryError extends Error {
  constructor() { super('Semantic swimlane layout exceeds supported geometry bounds'); }
}
const geometryBoundsError = () => new SemanticLaneGeometryError();
// Keep enough room for an orthogonal connector, arrowhead and compact label,
// without carrying Dagre's presentation spacing through every process rank.
// This is a group-level flow-axis compaction: peer lanes still share one
// extent and individual lanes are never resized independently.

/** Shared process ranks and bounded per-peer corridors, before any edge routing. */
export const alignDomainDagreLaneFlow = (nodes: Node[], edges: Edge[], options: SemanticLaneFlowOptions): Node[] => {
  const { direction, nodeToSubGroup, domainOrder = [], subDomainOrder } = options;
  const horizontal = direction === 'LR' || direction === 'RL';
  const reversed = direction === 'BT' || direction === 'RL';
  const flow = horizontal ? 'x' : 'y';
  const cross = horizontal ? 'y' : 'x';
  // Flow-axis spacing controls process density, while cross-axis spacing keeps
  // adjacent lanes and their orthogonal connectors apart. Treating both as a
  // 120px lane gap silently discarded the validated 30/40px layout settings
  // and made long workflows substantially taller/wider than requested.
  const requestedFlowGap = horizontal ? options.horizontalGap : options.verticalGap;
  const requestedCrossGap = horizontal ? options.verticalGap : options.horizontalGap;
  const flowGap = boundedDomainDagreNumber(
    requestedFlowGap,
    120,
    horizontal ? 40 : 30,
    5000,
  );
  const crossGap = boundedDomainDagreNumber(requestedCrossGap, 120, 120, 5000);
  const maxFlowBandGap = Math.min(
    horizontal ? 96 : 64,
    flowGap,
  );
  const leaves = nodes.filter(node => !isDomainDagreGroupNode(node) && !isDomainDagreNodeHidden(node));
  if (!leaves.length) return nodes;
  if (leaves.some(node => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) {
    throw geometryBoundsError();
  }
  // Ranking semantics are explicit; adding isolated nodes never changes them.
  const compactLaneRanks = options.rankMode === 'compact';
  const positionScopes = new Map<string, Node[]>();
  for (const node of leaves) {
    const key = compactLaneRanks ? domainDagreDomainOf(node) : '';
    appendGrouped(positionScopes, key, node);
  }
  const globalPositions = new Map<string, { id: string; x: number; y: number }>();
  for (const members of positionScopes.values()) {
    const memberIds = new Set(members.map(node => node.id));
    const scopedEdges = edges.filter(edge => memberIds.has(edge.source) && memberIds.has(edge.target));
    for (const position of layoutWithDagre(
      members, scopedEdges, horizontal ? 'LR' : 'TB', crossGap, flowGap,
    )) {
      globalPositions.set(position.id, position);
    }
  }
  const domains = nodes.filter(node => node.type === 'titleGroup' && !isDomainDagreNodeHidden(node));
  if (!domains.length) return nodes;
  // Process ranks order business nodes along a lane; they do not redefine
  // the declared cross-axis lane order, especially for independent cards.
  const declarationRank = new Map(domains.map((domain, index) => [domain.id, index]));
  const explicitRank = new Map(domainOrder.map((key, index) => [key, index]));
  const orderedDomains = domains.toSorted((a, b) =>
    (explicitRank.get(domainDagreDomainOf(a)) ?? Number.MAX_SAFE_INTEGER)
    - (explicitRank.get(domainDagreDomainOf(b)) ?? Number.MAX_SAFE_INTEGER)
    || (declarationRank.get(a.id) ?? 0) - (declarationRank.get(b.id) ?? 0));
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
  const coordinateScopes: DomainDagreLaneCoordinateScope[] = [];
  for (const domain of orderedDomains) {
    const domainKey = domainDagreDomainOf(domain);
    const members = leaves.filter(node => domainDagreDomainOf(node) === domainKey);
    const buckets = new Map<string, Node[]>();
    for (const node of members) {
      const parent = originals.get(nodeToSubGroup?.get(node.id) ?? node.parentId ?? '');
      const key = parent?.type === 'subGroup' ? parent.id : domain.id;
      appendGrouped(buckets, key, node);
    }
    let bucketCross = domainCross + (horizontal ? 88 : 32);
    const orderedBuckets = [...buckets].sort(([a], [b]) =>
      getDomainDagreSubDomainOrderIndex(subDomainOrder, domainKey, originals.get(a)?.data.subDomain)
      - getDomainDagreSubDomainOrderIndex(subDomainOrder, domainKey, originals.get(b)?.data.subDomain));
    coordinateScopes.push({ domainId: domain.id,
      buckets: orderedBuckets.map(([id, bucket]) => ({ id, nodeIds: bucket.map(node => node.id) })) });
    for (const [id, bucket] of orderedBuckets) {
      const compactCross = compactDomainDagreLaneCrossAxis(bucket, globalPositions, cross, crossGap);
      const crossPosition = (node: Node) => compactCross.get(node.id) ?? node.position[cross];
      const minCross = Math.min(...bucket.map(crossPosition));
      const maxCross = Math.max(...bucket.map(node => crossPosition(node) + crossSize(node)));
      const inset = horizontal ? 64 : 32;
      const width = maxCross - minCross + inset + 32;
      for (const node of bucket) {
        const leaf = withoutAbsolutePosition(node);
        replacements.set(node.id, { ...leaf, position: at(bucketCross + inset + crossPosition(node) - minCross,
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
    appendGrouped(layers, key, node);
  }
  const neighbors = new Map<string, string[]>();
  const neighborRelations = new Set<string>();
  for (const edge of edges) {
    const relation = JSON.stringify([edge.source, edge.target]);
    if (neighborRelations.has(relation)) continue;
    neighborRelations.add(relation);
    appendGrouped(neighbors, edge.source, edge.target);
    appendGrouped(neighbors, edge.target, edge.source);
  }
  const center = (node: Node) => node.position[cross] + crossSize(node) / 2;
  // Local-only branch ordering cannot see a target in an adjacent domain.
  // Keep ranks and lane bounds, but order peers using all incident endpoints.
  for (let sweep = 0; sweep < 4; sweep++) {
    for (const layer of layers.values()) {
      const slots = layer.map(node => replacements.get(node.id) ?? node)
        .sort((a, b) => a.position[cross] - b.position[cross]);
      const gaps = slots.slice(1).map((node, index) => (
        node.position[cross] - slots[index].position[cross] - crossSize(slots[index])
      ));
      const barycenter = (node: Node) => {
        const adjacent = (neighbors.get(node.id) ?? []).flatMap(id => {
          const neighbor = replacements.get(id);
          return neighbor ? [center(neighbor)] : [];
        });
        return adjacent.length ? adjacent.reduce((sum, value) => sum + value, 0) / adjacent.length : center(node);
      };
      const ordered = layer.toSorted((a, b) => barycenter(a) - barycenter(b));
      // Centers are not interchangeable slots when peers have different sizes.
      // Repack their widths/heights and original gaps inside the same span so
      // React Flow never clamps a reordered child away from its routed position.
      let cursor = slots[0].position[cross];
      ordered.forEach((node, index) => {
        const current = replacements.get(node.id) ?? node;
        replacements.set(node.id, moveAlong(current, cross, cursor));
        cursor += crossSize(current) + (gaps[index] ?? 0);
      });
    }
  }
  // Reserve distinct flow corridors for peers instead of forcing every
  // independent branch and cross-domain merge through the same rank gap.
  const flowRanks = new Map<number, Node[]>();
  const peerComponents = domainDagrePeerComponentIndex(leaves.map(node => node.id), edges);
  for (const node of leaves) {
    const rankCenter = (globalPositions.get(node.id)?.[flow] ?? 0) + flowSize(node) / 2;
    appendGrouped(flowRanks, rankCenter, node);
  }
  let flowOffset = 0;
  let flowReduction = 0;
  let occupiedEnd: number | undefined;
  for (const [, peers] of [...flowRanks].sort(([a], [b]) => a - b)) {
    const peerGroupsByScope = new Map<string, Node[]>();
    for (const node of peers) {
      const scope = compactLaneRanks ? domainDagreDomainOf(node) : '';
      const component = peerComponents.get(node.id) ?? node.id;
      appendGrouped(peerGroupsByScope, JSON.stringify([scope, component]), node);
    }
    const peerGroups = [...peerGroupsByScope.values()];
    let maximumPeerOffset = 0;
    const positioned = peerGroups.flatMap(domainPeers => (
      domainPeers
        .toSorted((a, b) => center(replacements.get(a.id) ?? a) - center(replacements.get(b.id) ?? b))
        .map((node, index) => {
          const current = replacements.get(node.id) ?? node;
          const peerOffset = index * flowGap + (compactLaneRanks && domainPeers.length > 3 ? 64 : 0);
          maximumPeerOffset = Math.max(maximumPeerOffset, peerOffset);
          return moveAlong(current, flow, current.position[flow] + flowOffset + peerOffset);
        })
    ));
    const bandStart = Math.min(...positioned.map(node => node.position[flow]));
    const bandEnd = Math.max(...positioned.map(node => node.position[flow] + flowSize(node)));
    if (occupiedEnd !== undefined) {
      flowReduction += Math.max(0, bandStart - occupiedEnd - maxFlowBandGap);
    }
    for (const node of positioned) replacements.set(node.id, moveAlong(node, flow, node.position[flow] - flowReduction));
    occupiedEnd = bandEnd;
    flowOffset += maximumPeerOffset;
  }
  for (const node of replacements.values()) {
    if (!isDomainDagreGroupNode(node)) continue;
    replacements.set(node.id, resize(node, node.position[cross], node.position[flow], crossSize(node), flowSize(node) + flowOffset - flowReduction));
  }
  assignDomainDagreLaneCoordinates(replacements, coordinateScopes, edges, horizontal, crossGap, flowGap,
    options.independentNodeArrangement);
  if (reversed) {
    const visible = leaves.map(node => replacements.get(node.id) ?? node);
    const mirror = Math.min(...visible.map(node => node.position[flow]))
      + Math.max(...visible.map(node => node.position[flow] + flowSize(node)));
    for (const node of visible) {
      replacements.set(node.id, moveAlong(node, flow, mirror - node.position[flow] - flowSize(node)));
    }
  }
  if ([...replacements.values()].some(node => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)
    || Math.abs(node.position.x) + getNodeDimensions(node).width > 1_000_000
    || Math.abs(node.position.y) + getNodeDimensions(node).height > 1_000_000)) {
    throw geometryBoundsError();
  }
  return nodes.map(node => replacements.get(node.id) ?? node);
};
