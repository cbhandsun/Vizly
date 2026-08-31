import type { Edge, Node, XYPosition } from '@xyflow/react';

import {
  getDomainDagreSubDomainOrderIndex,
  type DomainDagreSubDomainOrder,
} from './domainDagreLayoutBoundary';

const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
const MAX_TEXT_LENGTH = 200;
const MAX_CHILDREN = 10_000;

type NodeWithAbsolutePosition = Node & { positionAbsolute?: XYPosition };

const boundedString = (value: unknown): string => (
  typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : ''
);

const finiteCoordinate = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1_000_000, Math.max(-1_000_000, value))
    : fallback
);

const childIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .slice(0, MAX_CHILDREN)
    .map(boundedString)
    .filter(Boolean))];
};

export const domainDagreDomainOf = (node: Node): string => boundedString(node.data.domain);

/** Edge storage order is not business order: retain the declared node order. */
export const orderDomainDagreEdges = (nodes: readonly Node[], edges: readonly Edge[]): Edge[] => {
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const rank = (id: string) => nodeOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  return edges.toSorted((a, b) => rank(a.source) - rank(b.source)
    || rank(a.target) - rank(b.target) || a.id.localeCompare(b.id));
};

export const isDomainDagreGroupNode = (node: Node): boolean => GROUP_TYPES.has(String(node.type || ''));

export const isDomainDagreNodeHidden = (node: Node): boolean => (
  node.hidden === true || node.data.hidden === true
);

export interface DomainDagreMembership {
  childrenBySubGroup: Map<string, string[]>;
  nodeToSubGroup: Map<string, string>;
}

export const buildDomainDagreMembership = (
  nodes: Node[],
  subGroups: Node[],
): DomainDagreMembership => {
  const nodeIds = new Set(nodes.map(node => node.id));
  const childrenBySubGroup = new Map<string, string[]>();
  const nodeToSubGroup = new Map<string, string>();
  for (const subGroup of subGroups) {
    const children = childIds(subGroup.data.children).filter(id => nodeIds.has(id));
    childrenBySubGroup.set(subGroup.id, children);
    for (const childId of children) nodeToSubGroup.set(childId, subGroup.id);
  }
  return { childrenBySubGroup, nodeToSubGroup };
};

export const convertDomainDagreToHierarchy = (
  nodes: Node[],
  nodeToSubGroup: Map<string, string>,
): Node[] => {
  const absolutePositions = new Map<string, XYPosition>();
  for (const node of nodes as NodeWithAbsolutePosition[]) {
    absolutePositions.set(node.id, {
      x: finiteCoordinate(node.positionAbsolute?.x, finiteCoordinate(node.position.x, 0)),
      y: finiteCoordinate(node.positionAbsolute?.y, finiteCoordinate(node.position.y, 0)),
    });
  }
  const visibleDomainByKey = new Map<string, Node>();
  for (const node of nodes) {
    if (String(node.type || '') !== 'titleGroup' || isDomainDagreNodeHidden(node)) continue;
    const domain = domainDagreDomainOf(node);
    if (domain && !visibleDomainByKey.has(domain)) visibleDomainByKey.set(domain, node);
  }

  return (nodes as NodeWithAbsolutePosition[]).map(source => {
    const { positionAbsolute: _positionAbsolute, ...node } = source;
    const absolute = absolutePositions.get(node.id) ?? { x: 0, y: 0 };
    const subGroupId = nodeToSubGroup.get(node.id);
    const domainParent = String(node.type || '') === 'titleGroup'
      ? undefined
      : visibleDomainByKey.get(domainDagreDomainOf(node))?.id;
    const parentId = subGroupId ?? domainParent;
    const parentAbsolute = parentId ? absolutePositions.get(parentId) : undefined;
    return {
      ...node,
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
      position: parentAbsolute
        ? { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y }
        : { ...absolute },
    };
  });
};

export const sortDomainDagreHierarchy = (nodes: Node[]): Node[] => {
  const typeOrder: Record<string, number> = {
    titleGroup: 0,
    domain: 0,
    subGroup: 1,
    group: 2,
  };
  return nodes.toSorted((left, right) => (
    (typeOrder[String(left.type)] ?? 99) - (typeOrder[String(right.type)] ?? 99)
  ));
};

export const sortDomainDagreSubGroups = (
  nodes: Node[],
  domain: string,
  order: DomainDagreSubDomainOrder | undefined,
): Node[] => nodes.toSorted((left, right) => {
  const leftKey = boundedString(left.data.subDomain ?? left.data.description);
  const rightKey = boundedString(right.data.subDomain ?? right.data.description);
  return getDomainDagreSubDomainOrderIndex(order, domain, leftKey)
    - getDomainDagreSubDomainOrderIndex(order, domain, rightKey);
});
