import type { Edge, Node } from '@xyflow/react';
import { layoutWithDagre } from './DomainDagreLayoutHelpers';
import {
  domainDagreDomainOf,
  isDomainDagreNodeHidden,
} from './domainDagreHierarchy';

type NodeDimensions = (node: Node) => { width: number; height: number };

export interface DomainDagreTopLevelLayoutContext {
  nodes: Node[];
  edges: Edge[];
  domains: Node[];
  leafNodes: Node[];
  nodeById: Map<string, Node>;
  nodeToSubGroup: Map<string, string>;
  domainOrder: string[];
  domainOrderIndex: Map<string, number>;
  isHorizontal: boolean;
  domainGap: number;
  getNodeDimensions: NodeDimensions;
}

export const buildDomainDagreCrossDomainEdges = (
  edges: Edge[],
  domains: Node[],
  nodeById: Map<string, Node>,
): Edge[] => {
  const domainIdByKey = new Map<string, string>();
  for (const domain of domains) {
    const key = domainDagreDomainOf(domain);
    if (key && !domainIdByKey.has(key)) domainIdByKey.set(key, domain.id);
  }

  const result: Edge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const sourceDomain = nodeById.get(edge.source);
    const targetDomain = nodeById.get(edge.target);
    if (!sourceDomain || !targetDomain) continue;
    const sourceDomainId = domainIdByKey.get(domainDagreDomainOf(sourceDomain));
    const targetDomainId = domainIdByKey.get(domainDagreDomainOf(targetDomain));
    if (!sourceDomainId || !targetDomainId || sourceDomainId === targetDomainId) continue;
    const key = `${sourceDomainId}\u0000${targetDomainId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `domain_edge_${sourceDomainId}_${targetDomainId}`,
      source: sourceDomainId,
      target: targetDomainId,
    });
  }
  return result;
};

const moveDomainMembers = (
  nodes: Node[],
  domain: Node,
  deltaX: number,
  deltaY: number,
): void => {
  const domainKey = domainDagreDomainOf(domain);
  for (const child of nodes) {
    if (child.id === domain.id || domainDagreDomainOf(child) !== domainKey) continue;
    child.position = {
      x: child.position.x + deltaX,
      y: child.position.y + deltaY,
    };
  }
  domain.position = {
    x: domain.position.x + deltaX,
    y: domain.position.y + deltaY,
  };
};

/**
 * Orders cyclic domain lanes without running another layout or routing pass.
 * A weighted net-flow sweep is the bounded approximation used here: source-
 * heavy domains lead, sink-heavy domains follow, and scan order breaks ties.
 * Explicit semantic order always wins.
 */
export const resolveDomainDagreOrderedLaneKeys = (
  context: Pick<
    DomainDagreTopLevelLayoutContext,
    'domains' | 'edges' | 'nodeById' | 'domainOrder'
  >,
): string[] => {
  const visibleKeys = context.domains
    .filter(domain => !isDomainDagreNodeHidden(domain))
    .map(domainDagreDomainOf)
    .filter((key): key is string => Boolean(key));
  const uniqueKeys = [...new Set(visibleKeys)];
  if (context.domainOrder.length > 0) {
    const explicit = context.domainOrder.filter(key => uniqueKeys.includes(key));
    return [...new Set([...explicit, ...uniqueKeys])];
  }

  const score = new Map<string, number>(uniqueKeys.map(key => [key, 0]));
  for (const edge of context.edges) {
    const source = context.nodeById.get(edge.source);
    const target = context.nodeById.get(edge.target);
    if (!source || !target) continue;
    const sourceKey = domainDagreDomainOf(source);
    const targetKey = domainDagreDomainOf(target);
    if (!sourceKey || !targetKey || sourceKey === targetKey) continue;
    if (!score.has(sourceKey) || !score.has(targetKey)) continue;
    score.set(sourceKey, (score.get(sourceKey) ?? 0) + 1);
    score.set(targetKey, (score.get(targetKey) ?? 0) - 1);
  }
  const scanIndex = new Map(uniqueKeys.map((key, index) => [key, index] as const));
  return uniqueKeys.toSorted((left, right) => (
    (score.get(right) ?? 0) - (score.get(left) ?? 0)
    || (scanIndex.get(left) ?? 0) - (scanIndex.get(right) ?? 0)
  ));
};

export const reorderDomainDagreDomains = (
  context: Pick<
    DomainDagreTopLevelLayoutContext,
    | 'nodes'
    | 'domainOrder'
    | 'domainOrderIndex'
    | 'isHorizontal'
    | 'domainGap'
    | 'getNodeDimensions'
  >,
): void => {
  const domains = context.nodes.filter(node => (
    String(node.type || '') === 'titleGroup' && !isDomainDagreNodeHidden(node)
  ));
  if (context.domainOrder.length === 0 || domains.length <= 1) return;
  const orderedDomains = domains.toSorted((left, right) => (
    (context.domainOrderIndex.get(domainDagreDomainOf(left)) ?? Infinity)
    - (context.domainOrderIndex.get(domainDagreDomainOf(right)) ?? Infinity)
  ));
  const startX = Math.min(...domains.map(domain => domain.position.x));
  const startY = Math.min(...domains.map(domain => domain.position.y));
  let cursor = context.isHorizontal ? startX : startY;

  for (const domain of orderedDomains) {
    const targetX = context.isHorizontal ? cursor : startX;
    const targetY = context.isHorizontal ? startY : cursor;
    const deltaX = targetX - domain.position.x;
    const deltaY = targetY - domain.position.y;
    if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
      moveDomainMembers(context.nodes, domain, deltaX, deltaY);
    }
    const dimensions = context.getNodeDimensions(domain);
    cursor += (context.isHorizontal ? dimensions.width : dimensions.height) + context.domainGap;
  }
};

export const runDomainDagreTopLevelLayout = (
  context: DomainDagreTopLevelLayoutContext,
): void => {
  const crossDomainEdges = buildDomainDagreCrossDomainEdges(
    context.edges,
    context.domains,
    context.nodeById,
  );
  const orphanNodes = context.leafNodes.filter(node => (
    !domainDagreDomainOf(node) && !context.nodeToSubGroup.has(node.id)
  ));
  const layoutNodes = [...context.domains, ...orphanNodes];
  const positions = layoutWithDagre(
    layoutNodes,
    crossDomainEdges,
    context.isHorizontal ? 'LR' : 'TB',
    context.domainGap,
    context.domainGap,
    context.getNodeDimensions,
    'network-simplex',
  );

  for (const position of positions) {
    const node = context.nodeById.get(position.id);
    if (!node) continue;
    const deltaX = position.x - node.position.x;
    const deltaY = position.y - node.position.y;
    if (String(node.type || '') === 'titleGroup') {
      moveDomainMembers(context.nodes, node, deltaX, deltaY);
    } else {
      node.position = { x: position.x, y: position.y };
    }
  }
  reorderDomainDagreDomains(context);
};

/**
 * Stable lane placement for domain graphs whose quotient graph contains
 * feedback cycles. Cross-domain edges do not participate in top-level ranking;
 * they are routed after the semantic containers have been packed.
 */
export const runDomainDagreOrderedLaneLayout = (
  context: DomainDagreTopLevelLayoutContext,
): void => {
  const visibleDomains = context.domains.filter(domain => !isDomainDagreNodeHidden(domain));
  const laneOrder = resolveDomainDagreOrderedLaneKeys(context);
  const domainRank = new Map(
    laneOrder.map((domainKey, index) => [domainKey, index] as const),
  );
  const orderedDomains = visibleDomains.toSorted((left, right) => (
    (domainRank.get(domainDagreDomainOf(left)) ?? Number.MAX_SAFE_INTEGER)
    - (domainRank.get(domainDagreDomainOf(right)) ?? Number.MAX_SAFE_INTEGER)
  ));
  const orphanNodes = context.leafNodes.filter(node => (
    !domainDagreDomainOf(node) && !context.nodeToSubGroup.has(node.id)
  ));
  const laneItems = [...orderedDomains, ...orphanNodes];
  if (laneItems.length === 0) return;

  const startX = Math.min(...laneItems.map(item => item.position.x));
  const startY = Math.min(...laneItems.map(item => item.position.y));
  // Swimlanes are packed across the flow direction: LR flow uses horizontal
  // lanes stacked vertically; TB flow uses vertical lanes stacked horizontally.
  const packAlongX = !context.isHorizontal;
  let cursor = packAlongX ? startX : startY;

  for (const item of laneItems) {
    const targetX = packAlongX ? cursor : startX;
    const targetY = packAlongX ? startY : cursor;
    const deltaX = targetX - item.position.x;
    const deltaY = targetY - item.position.y;
    if (String(item.type || '') === 'titleGroup') {
      moveDomainMembers(context.nodes, item, deltaX, deltaY);
    } else {
      item.position = { x: targetX, y: targetY };
    }
    const dimensions = context.getNodeDimensions(item);
    cursor += (packAlongX ? dimensions.width : dimensions.height) + context.domainGap;
  }
};
