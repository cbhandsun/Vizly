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
