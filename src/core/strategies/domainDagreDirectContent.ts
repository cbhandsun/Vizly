import type { Edge, Node } from '@xyflow/react';
import { arrangeDomainDagreChildren, type DomainDagreNodeArrangement } from './domainDagreChildArrangement';
import { domainDagreDomainOf, isDomainDagreGroupNode, isDomainDagreNodeHidden } from './domainDagreHierarchy';
import type { DomainDagreComponentIndex } from './domainDagrePeerComponents';

/** Direct children are one content block, so subgroup packing cannot split or
 * overlap their grid. The temporary block never enters the returned graph.
 */
export function createDomainDagreDirectContent(
  nodes: readonly Node[], edges: readonly Edge[], arrangement: DomainDagreNodeArrangement,
  horizontal: boolean, gapH: number, gapV: number,
  dimensions: (node: Node) => { width: number; height: number },
  occupiedIds: ReadonlySet<string>, packComponents: boolean,
  globalComponentByNodeId?: DomainDagreComponentIndex,
): Readonly<{ block: Node; positions: readonly { id: string; x: number; y: number }[] }> | undefined {
  if (!nodes.length) return undefined;
  let id = 'layout:direct-content';
  while (occupiedIds.has(id)) id += ':';
  const ids = new Set(nodes.map(node => node.id));
  const positions = arrangeDomainDagreChildren(nodes, edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)),
    arrangement, horizontal, gapH, gapV, dimensions, packComponents, undefined, globalComponentByNodeId);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const width = Math.max(...positions.map(position => position.x + dimensions(byId.get(position.id) ?? nodes[0]).width));
  const height = Math.max(...positions.map(position => position.y + dimensions(byId.get(position.id) ?? nodes[0]).height));
  return { block: { id, type: 'group', data: {}, position: { x: 0, y: 0 }, width, height,
    measured: { width, height }, style: { width, height } }, positions };
}

/** Centering only subgroup members is safe only when the domain has no direct
 * leaf block. Mixed contents have already been placed together by Dagre.
 */
export function centerDomainDagreSubGroups(nodes: Node[], membership: ReadonlyMap<string, string>,
  center: (members: Node[]) => Node[] = members => members): Node[] {
  const mixed = new Set(nodes.filter(node => !isDomainDagreGroupNode(node) && !isDomainDagreNodeHidden(node)
    && !membership.has(node.id)).map(domainDagreDomainOf));
  const eligible = nodes.filter(node => !mixed.has(domainDagreDomainOf(node)));
  const centered = new Map(center(eligible).map(node => [node.id, node]));
  return nodes.map(node => centered.get(node.id) ?? node);
}
