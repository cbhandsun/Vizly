import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import type { ElkNode } from 'elkjs';

import type { LayoutOptions } from '../types/layout';
import { AbstractElkLayoutStrategy } from './AbstractElkLayoutStrategy';
import { DOMAIN_ELK_LAYERED_QUALITY_OPTIONS } from './domainElkLayoutProfile';

const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const finiteDimension = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
);

const nodeDataString = (node: ReactFlowNode, key: string): string => {
  const value = asRecord(node.data)[key];
  return typeof value === 'string' ? value.trim() : '';
};

const isVisibleGroup = (node: ReactFlowNode, type: string): boolean => (
  String(node.type || '') === type && asRecord(node.data).hidden !== true
);

const nodeDimensions = (node: ReactFlowNode) => ({
  width: finiteDimension(node.measured?.width ?? node.style?.width ?? node.width, 180),
  height: finiteDimension(node.measured?.height ?? node.style?.height ?? node.height, 80),
});

const orderByExplicitKeys = (
  values: string[],
  explicitOrder: string[] | undefined,
): string[] => {
  if (!explicitOrder?.length) return values;
  const rank = new Map(explicitOrder.map((value, index) => [value, index] as const));
  return [...values].sort((left, right) => (
    (rank.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
  ));
};

/**
 * ELK compound layout: domains and sub-domains are real nested graph nodes,
 * while business edges remain connected to leaf nodes across hierarchy levels.
 * This preserves semantic containers without giving up ELK ranking and cycle
 * handling on dense DAGs or feedback graphs.
 */
export class DomainCompoundElkLayoutStrategy extends AbstractElkLayoutStrategy {
  getName(): string { return 'DomainCompoundElkLayout'; }
  getCategory(): 'hierarchy' | 'node' { return 'hierarchy'; }
  getDescription(): string { return 'ELK 复合分层：域容器与域内业务节点联合布局'; }

  protected buildElkGraph(
    nodes: ReactFlowNode[],
    edges: Edge[],
    options: LayoutOptions,
  ): ElkNode {
    const direction = options.direction === 'LR'
      ? 'RIGHT'
      : options.direction === 'RL'
        ? 'LEFT'
        : options.direction === 'BT'
          ? 'UP'
          : 'DOWN';
    const horizontalSpacing = finiteDimension(options.spacing?.horizontal, 120);
    const verticalSpacing = finiteDimension(options.spacing?.vertical, 120);
    const graphOptions = {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      // Compound edge sections otherwise use their lowest common container as
      // the coordinate origin. Downstream routes are projected in root space.
      'elk.json.edgeCoords': 'ROOT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': String(horizontalSpacing),
      'elk.spacing.edgeNode': '64',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(verticalSpacing),
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.layered.mergeEdges': 'true',
      'elk.layered.mergeHierarchyEdges': 'true',
      // ELK's ordinary greedy switch is ignored for INCLUDE_CHILDREN graphs.
      // Prefer cross-hierarchy sweeps and enable the hierarchy-aware variant
      // so domain boundaries participate in crossing minimization.
      'elk.layered.crossingMinimization.hierarchicalSweepiness': '1.0',
      'elk.layered.crossingMinimization.greedySwitchHierarchical.type': 'TWO_SIDED',
      ...DOMAIN_ELK_LAYERED_QUALITY_OPTIONS,
    };
    const businessNodes = nodes.filter(node => !GROUP_TYPES.has(String(node.type || '')));
    const businessIds = new Set(businessNodes.map(node => node.id));
    const businessByDomain = new Map<string, ReactFlowNode[]>();
    for (const node of businessNodes) {
      const domain = nodeDataString(node, 'domain');
      const members = businessByDomain.get(domain) ?? [];
      members.push(node);
      businessByDomain.set(domain, members);
    }
    const titleGroupByDomain = new Map(
      nodes
        .filter(node => isVisibleGroup(node, 'titleGroup'))
        .map(node => [nodeDataString(node, 'domain'), node] as const),
    );
    const subGroups = nodes.filter(node => isVisibleGroup(node, 'subGroup'));
    const claimedBusinessIds = new Set<string>();
    const nestedGroupIds = new Set<string>();

    const leaf = (node: ReactFlowNode): ElkNode => ({
      id: node.id,
      ...nodeDimensions(node),
    });
    const nestedOptions = (padding: string) => ({
      ...graphOptions,
      'elk.padding': padding,
    });
    const makeSubGroup = (group: ReactFlowNode): ElkNode | null => {
      const domain = nodeDataString(group, 'domain');
      const subDomain = nodeDataString(group, 'subDomain');
      const children = businessNodes.filter(node => (
        nodeDataString(node, 'domain') === domain
        && nodeDataString(node, 'subDomain') === subDomain
      ));
      if (children.length === 0) return null;
      children.forEach(node => claimedBusinessIds.add(node.id));
      return {
        id: group.id,
        layoutOptions: nestedOptions('[top=64,left=32,bottom=28,right=32]'),
        children: children.map(leaf),
      };
    };

    const explicitDomains = orderByExplicitKeys(
      [...titleGroupByDomain.keys()].filter(Boolean),
      options.domainOrder,
    );
    const rootChildren: ElkNode[] = [];
    for (const domain of explicitDomains) {
      const group = titleGroupByDomain.get(domain);
      if (!group) continue;
      const explicitSubDomainOrder = Array.isArray(options.subDomainOrder)
        ? options.subDomainOrder
        : options.subDomainOrder?.[domain] ?? [];
      const subDomainRank = new Map(
        explicitSubDomainOrder.map((value, index) => [value, index] as const),
      );
      const compoundChildren = subGroups
        .filter(subGroup => nodeDataString(subGroup, 'domain') === domain)
        .sort((left, right) => (
          (subDomainRank.get(nodeDataString(left, 'subDomain')) ?? Number.MAX_SAFE_INTEGER)
          - (subDomainRank.get(nodeDataString(right, 'subDomain')) ?? Number.MAX_SAFE_INTEGER)
        ))
        .map(makeSubGroup)
        .filter((node): node is ElkNode => node !== null);
      compoundChildren.forEach(child => nestedGroupIds.add(child.id));
      const freeMembers = (businessByDomain.get(domain) ?? [])
        .filter(node => !claimedBusinessIds.has(node.id));
      freeMembers.forEach(node => claimedBusinessIds.add(node.id));
      rootChildren.push({
        id: group.id,
        layoutOptions: nestedOptions('[top=88,left=44,bottom=36,right=44]'),
        children: [...compoundChildren, ...freeMembers.map(leaf)],
      });
    }

    for (const subGroup of subGroups) {
      const compound = makeSubGroup(subGroup);
      if (compound && !nestedGroupIds.has(compound.id)) {
        nestedGroupIds.add(compound.id);
        rootChildren.push(compound);
      }
    }
    for (const node of businessNodes) {
      if (!claimedBusinessIds.has(node.id)) rootChildren.push(leaf(node));
    }

    return {
      id: 'domain-compound-elk-root',
      layoutOptions: graphOptions,
      children: rootChildren,
      edges: edges
        .filter(edge => businessIds.has(edge.source) && businessIds.has(edge.target))
        .map(edge => ({
          id: edge.id || `${edge.source}->${edge.target}`,
          sources: [edge.source],
          targets: [edge.target],
        })),
    };
  }
}

export default DomainCompoundElkLayoutStrategy;
