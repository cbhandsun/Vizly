import type { Edge, Node } from '@xyflow/react';
import { getNodeDimensions } from './DomainDagreLayoutHelpers';
import { compactDomainDagreLaneCrossAxis } from './domainDagreLaneCrossCompaction';
import { arrangeDomainDagreChildren } from './domainDagreChildArrangement';
import { isDomainDagreNodeHidden } from './domainDagreHierarchy';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from './shared/edgeBusinessNodeClearanceRepair';

export type DomainDagreLaneBucket = Readonly<{ id: string; nodeIds: readonly string[] }>;
export type DomainDagreLaneCoordinateScope = Readonly<{ domainId: string; buckets: readonly DomainDagreLaneBucket[] }>;

const channelPreservesClearance = (nodes: Node[], proposed: ReadonlyMap<string, Node>): boolean => {
  const boxes = nodes.map(node => ({ id: node.id, ...(proposed.get(node.id) ?? node).position,
    ...getNodeDimensions(proposed.get(node.id) ?? node) }));
  for (let first = 0; first < boxes.length; first++) for (let second = first + 1; second < boxes.length; second++) {
    const a = boxes[first], b = boxes[second];
    if (!proposed.has(a.id) && !proposed.has(b.id)) continue;
    if (Math.max(b.x - a.x - a.width, a.x - b.x - b.width,
      b.y - a.y - a.height, a.y - b.y - b.height) < COMMERCIAL_BUSINESS_NODE_CLEARANCE) return false;
  }
  return true;
};

/** Final coordinate assignment consumes final process bands, never provisional ranks.
 * Unconnected cards have no process phase. They use a separate content block,
 * filling the existing lane extent without displacing the connected flow.
 */
export function assignDomainDagreLaneCoordinates(
  replacements: Map<string, Node>, scopes: readonly DomainDagreLaneCoordinateScope[],
  edges: readonly Edge[], horizontal: boolean, crossGap: number, flowGap: number,
  independentArrangement?: 'grid' | 'flow',
): void {
  const cross = horizontal ? 'y' : 'x';
  const flow = horizontal ? 'x' : 'y';
  const crossDimension = horizontal ? 'height' : 'width';
  const flowDimension = horizontal ? 'width' : 'height';
  const connected = new Set(edges.filter(edge => replacements.has(edge.source) && replacements.has(edge.target))
    .flatMap(edge => [edge.source, edge.target]));
  const crossSize = (node: Node) => getNodeDimensions(node)[crossDimension];
  const flowSize = (node: Node) => getNodeDimensions(node)[flowDimension];
  const at = (c: number, f: number) => horizontal ? { x: f, y: c } : { x: c, y: f };
  const resize = (node: Node, c: number, size: number): Node => {
    const dimensions = { ...getNodeDimensions(node), [crossDimension]: size };
    return { ...node, position: { ...node.position, [cross]: c }, ...dimensions,
      measured: dimensions, style: { ...node.style, ...dimensions } };
  };
  const independentMembers = (bucket: DomainDagreLaneBucket) => bucket.nodeIds.flatMap(id => {
    const node = replacements.get(id);
    return node && !connected.has(id) ? [node] : [];
  });
  const arrangeIndependentCards = (nodes: Node[], availableFlow?: number) => arrangeDomainDagreChildren(
    nodes, [], independentArrangement ?? 'grid', horizontal, horizontal ? flowGap : crossGap, horizontal ? crossGap : flowGap,
    getNodeDimensions, false, availableFlow === undefined ? undefined : {
      maxWidth: horizontal ? availableFlow : 1_000_000,
      maxHeight: horizontal ? 1_000_000 : availableFlow,
      objective: horizontal ? 'height' : 'width',
    },
  );
  if (independentArrangement) {
    const laneEnd = Math.max(0, ...scopes.flatMap(scope => {
      const domain = replacements.get(scope.domainId);
      return domain ? [domain.position[flow] + flowSize(domain)] : [];
    }));
    let requiredEnd = laneEnd;
    for (const scope of scopes) for (const bucket of scope.buckets) {
      const members = independentMembers(bucket);
      const byId = new Map(members.map(node => [node.id, node]));
      for (const position of arrangeIndependentCards(members)) {
        const node = byId.get(position.id);
        if (node) requiredEnd = Math.max(requiredEnd, 200 + position[flow] + flowSize(node) + 32);
      }
    }
    // Independent cards can grow the common envelope, never an individual
    // lane or the connected process bands. Nested backgrounds grow with it.
    const extra = requiredEnd - laneEnd;
    if (extra > 0.5) {
      const containers = new Set(scopes.flatMap(scope => [scope.domainId, ...scope.buckets.map(bucket => bucket.id)]));
      for (const id of containers) {
        const node = replacements.get(id);
        if (!node) continue;
        const dimensions = { ...getNodeDimensions(node), [flowDimension]: flowSize(node) + extra };
        replacements.set(id, { ...node, ...dimensions, measured: dimensions, style: { ...node.style, ...dimensions } });
      }
    }
  }
  let domainCross = 0;
  for (const scope of scopes) {
    const domain = replacements.get(scope.domainId);
    if (!domain) continue;
    let bucketCross = domainCross + (horizontal ? 88 : 32);
    for (const bucket of scope.buckets) {
      const members = bucket.nodeIds.flatMap(id => {
        const member = replacements.get(id);
        return member ? [member] : [];
      });
      if (!members.length) continue;
      const process = members.filter(node => connected.has(node.id));
      const isolated = members.filter(node => !connected.has(node.id));
      const compacted = compactDomainDagreLaneCrossAxis(process,
        new Map(process.map(node => [node.id, node.position])), cross, crossGap);
      const origin = process.length ? Math.min(...process.map(node => compacted.get(node.id) ?? node.position[cross])) : 0;
      // Direct content already receives the domain's outer inset. Only a
      // real nested container needs another border around its own content.
      const inset = bucket.id === scope.domainId ? 0 : horizontal ? 64 : 32;
      let occupiedWidth = 0;
      for (const node of process) {
        const c = (compacted.get(node.id) ?? node.position[cross]) - origin;
        occupiedWidth = Math.max(occupiedWidth, c + crossSize(node));
        replacements.set(node.id, { ...node, position: at(bucketCross + inset + c, node.position[flow]) });
      }
      const processIds = new Set(process.map(node => node.id));
      for (const hubInput of process.length <= 256 && edges.length <= 1024 ? process : []) {
        const hub = replacements.get(hubInput.id);
        if (!hub) continue;
        const neighborIds = new Set(edges.filter(edge => edge.source === hub.id || edge.target === hub.id)
          .map(edge => edge.source === hub.id ? edge.target : edge.source));
        const peers = [...neighborIds].filter(id => processIds.has(id)).flatMap(id => {
          const node = replacements.get(id);
          return node ? [node] : [];
        });
        if (peers.length < 4) continue;
        if (!peers.some((node, index) => peers.slice(index + 1).some(other =>
          node.position[flow] === other.position[flow] && node.position[cross] !== other.position[cross]))) continue;
        let channel = hub.position[cross] + crossSize(hub) / 2;
        const left = peers.filter(node => node.position[cross] + crossSize(node) <= channel);
        const right = peers.filter(node => node.position[cross] >= channel);
        if (!left.length || !right.length) continue;
        // Reserve a render-safe terminal plus one parallel routing track.
        const channelMargin = 56 + 24;
        channel = Math.max(channel, bucketCross + inset + Math.max(...left.map(crossSize)) + channelMargin);
        const proposed = new Map<string, Node>([[hub.id,
          { ...hub, position: at(channel - crossSize(hub) / 2, hub.position[flow]) }]]);
        for (const node of [...left, ...right]) {
          const next = left.includes(node)
            ? channel - channelMargin - crossSize(node)
            : channel + channelMargin;
          if (next < bucketCross + inset) continue;
          proposed.set(node.id, { ...node, position: at(next, node.position[flow]) });
        }
        // A shared channel may reuse a column only across separate flow bands.
        // Validate the hub and all moved peers against current bucket geometry
        // before applying any of them, including peers of earlier hubs.
        const current = process.map(node => replacements.get(node.id) ?? node);
        if (!channelPreservesClearance(current, proposed)) continue;
        for (const node of proposed.values()) {
          replacements.set(node.id, node);
          occupiedWidth = Math.max(occupiedWidth, node.position[cross] - bucketCross - inset + crossSize(node));
        }
      }
      // Explicit Grid/Flow uses the bounded card packer; automatic keeps its
      // linear fill inside the same common lane envelope.
      let column = process.length ? occupiedWidth + crossGap : 0;
      let columnWidth = 0;
      let cursor = 200;
      const availableEnd = Math.max(200, domain.position[flow] + flowSize(domain) - 32);
      if (independentArrangement) {
        const byId = new Map(isolated.map(node => [node.id, node]));
        for (const position of arrangeIndependentCards(isolated, Math.max(1, availableEnd - 200))) {
          const node = byId.get(position.id);
          if (!node) continue;
          replacements.set(node.id, { ...node, position: at(bucketCross + inset + column + position[cross], 200 + position[flow]) });
          occupiedWidth = Math.max(occupiedWidth, column + position[cross] + crossSize(node));
        }
      } else for (const node of isolated) {
        if (cursor > 200 && cursor + flowSize(node) > availableEnd + 0.5) {
          column += columnWidth + crossGap;
          columnWidth = 0;
          cursor = 200;
        }
        replacements.set(node.id, { ...node, position: at(bucketCross + inset + column, cursor) });
        columnWidth = Math.max(columnWidth, crossSize(node));
        occupiedWidth = Math.max(occupiedWidth, column + crossSize(node));
        cursor += flowSize(node) + flowGap;
      }
      const width = occupiedWidth + inset + (bucket.id === scope.domainId ? 0 : 32);
      const group = replacements.get(bucket.id);
      if (group && bucket.id !== scope.domainId) replacements.set(bucket.id, resize(group, bucketCross, width));
      bucketCross += width + crossGap;
    }
    const width = Math.max(128, bucketCross - domainCross - crossGap + 32);
    replacements.set(scope.domainId, resize(domain, domainCross, width));
    domainCross += width + crossGap;
  }
}

type DomainDagreFlowInsets = Readonly<{ leading: number; trailing: number }>;

/** Tighten nested presentation containers after global lane ranks are final.
 * Leaf coordinates and outer lane envelopes stay unchanged. */
export function tightenDomainDagreSubGroupFlowBounds(
  nodes: readonly Node[], nodeToSubGroup: ReadonlyMap<string, string>,
  horizontal: boolean, insets: DomainDagreFlowInsets,
): Node[] {
  if (![insets.leading, insets.trailing].every(value => Number.isFinite(value)
    && value >= 0 && value <= 10_000)) return nodes.slice();
  const flow = horizontal ? 'x' : 'y';
  const flowDimension = horizontal ? 'width' : 'height';
  const memberBounds = new Map<string, { start: number; end: number }>();
  for (const node of nodes) {
    if (isDomainDagreNodeHidden(node)) continue;
    const groupId = nodeToSubGroup.get(node.id);
    if (!groupId) continue;
    const start = node.position[flow], end = start + getNodeDimensions(node)[flowDimension];
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const previous = memberBounds.get(groupId);
    memberBounds.set(groupId, {
      start: Math.min(previous?.start ?? start, start),
      end: Math.max(previous?.end ?? end, end),
    });
  }
  return nodes.map(node => {
    if (node.type !== 'subGroup' || isDomainDagreNodeHidden(node)) return node;
    const members = memberBounds.get(node.id);
    if (!members) return node;
    const currentStart = node.position[flow], currentSize = getNodeDimensions(node)[flowDimension];
    const currentEnd = currentStart + currentSize;
    if (!Number.isFinite(currentStart) || !Number.isFinite(currentSize)
      || members.start < currentStart - 0.5 || members.end > currentEnd + 0.5) return node;
    // Retain every available inset without enlarging the old boundary.
    const start = Math.max(currentStart, members.start - insets.leading);
    const end = Math.min(currentEnd, members.end + insets.trailing);
    const size = end - start;
    if (size <= 0 || size >= currentSize - 0.5) return node;
    const dimensions = { ...getNodeDimensions(node), [flowDimension]: size };
    return { ...node, position: { ...node.position, [flow]: start }, ...dimensions,
      measured: dimensions, style: { ...node.style, ...dimensions } };
  });
}
