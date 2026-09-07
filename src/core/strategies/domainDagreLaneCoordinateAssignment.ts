import type { Edge, Node } from '@xyflow/react';
import { getNodeDimensions } from './DomainDagreLayoutHelpers';
import { compactDomainDagreLaneCrossAxis } from './domainDagreLaneCrossCompaction';
import { arrangeDomainDagreChildren } from './domainDagreChildArrangement';

export type DomainDagreLaneBucket = Readonly<{ id: string; nodeIds: readonly string[] }>;
export type DomainDagreLaneCoordinateScope = Readonly<{ domainId: string; buckets: readonly DomainDagreLaneBucket[] }>;

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
      const inset = horizontal ? 64 : 32;
      let occupiedWidth = 0;
      for (const node of process) {
        const c = (compacted.get(node.id) ?? node.position[cross]) - origin;
        occupiedWidth = Math.max(occupiedWidth, c + crossSize(node));
        replacements.set(node.id, { ...node, position: at(bucketCross + inset + c, node.position[flow]) });
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
      const width = occupiedWidth + inset + 32;
      const group = replacements.get(bucket.id);
      if (group && bucket.id !== scope.domainId) replacements.set(bucket.id, resize(group, bucketCross, width));
      bucketCross += width + crossGap;
    }
    const width = Math.max(128, bucketCross - domainCross - crossGap + 32);
    replacements.set(scope.domainId, resize(domain, domainCross, width));
    domainCross += width + crossGap;
  }
}
