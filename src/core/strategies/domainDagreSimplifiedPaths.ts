import type { Edge, Node as ReactFlowNode, XYPosition } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
import { separateParallelEdges } from '../utils/HandlePicker';
import {
  calculateBounds,
  layoutWithDagre,
  mapEdgesToContainers,
} from './DomainDagreLayoutHelpers';
import { applyDomainDagreEdgeRouting } from './DomainDagreEdgePreparation';
import {
  buildDomainDagreMembership,
  convertDomainDagreToHierarchy,
  sortDomainDagreHierarchy,
} from './domainDagreHierarchy';

type NodeDimensions = (node: ReactFlowNode) => { width: number; height: number };
type NodeWithAbsolutePosition = ReactFlowNode & { positionAbsolute?: XYPosition };

export interface DomainDagreSimplifiedPathContext {
  nodes: ReactFlowNode[];
  edges: Edge[];
  domains: ReactFlowNode[];
  subGroups: ReactFlowNode[];
  leafNodes: ReactFlowNode[];
  idMap: Map<string, ReactFlowNode>;
  routingConfig: unknown;
  options: LayoutOptions;
  isHorizontal: boolean;
  subDomainNodeIsHorizontal: boolean;
  domainSubGroupIsHorizontal: boolean;
  nodeGapH: number;
  nodeGapV: number;
  subDomainPaddingH: number;
  subDomainPaddingV: number;
  subDomainPaddingBottom: number;
  subDomainTitleHeight: number;
  titleSafetyGap: number;
  widthCompensation: number;
  getNodeDimensions: NodeDimensions;
}

export interface DomainDagreSimplifiedPathResult {
  nodes: ReactFlowNode[];
  edges: Edge[];
}

const offsetPosition = (position: XYPosition): XYPosition => ({
  x: position.x + 50,
  y: position.y + 50,
});

const visibleLeafEdges = (edges: Edge[], leafNodes: ReactFlowNode[]): Edge[] => {
  const visibleNodeIds = new Set(leafNodes.map(node => node.id));
  return edges.filter(edge => (
    visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  ));
};

const layoutWithoutGroups = (
  context: DomainDagreSimplifiedPathContext,
): DomainDagreSimplifiedPathResult => {
  const {
    nodes,
    edges,
    leafNodes,
    idMap,
    routingConfig,
    options,
    isHorizontal,
    nodeGapH,
    nodeGapV,
    getNodeDimensions,
  } = context;
  const positions = layoutWithDagre(
    leafNodes,
    edges,
    isHorizontal ? 'LR' : 'TB',
    isHorizontal ? nodeGapV : nodeGapH,
    isHorizontal ? nodeGapH : nodeGapV,
    getNodeDimensions,
    'network-simplex',
  );

  for (const position of positions) {
    const node = idMap.get(position.id);
    if (!node) continue;
    node.position = offsetPosition(position);
    node.measured = getNodeDimensions(node);
  }

  const validEdges = visibleLeafEdges(edges, leafNodes);
  applyDomainDagreEdgeRouting(nodes, validEdges, idMap, routingConfig, options);
  return {
    nodes: sortDomainDagreHierarchy(nodes),
    edges: separateParallelEdges(validEdges, 12),
  };
};

const layoutWithSubGroupsOnly = (
  context: DomainDagreSimplifiedPathContext,
): DomainDagreSimplifiedPathResult => {
  const {
    nodes,
    edges,
    subGroups,
    leafNodes,
    idMap,
    routingConfig,
    options,
    subDomainNodeIsHorizontal,
    domainSubGroupIsHorizontal,
    nodeGapH,
    nodeGapV,
    subDomainPaddingH,
    subDomainPaddingV,
    subDomainPaddingBottom,
    subDomainTitleHeight,
    titleSafetyGap,
    widthCompensation,
    getNodeDimensions,
  } = context;
  const { childrenBySubGroup, nodeToSubGroup } = buildDomainDagreMembership(nodes, subGroups);

  for (const subGroup of subGroups) {
    const children = (childrenBySubGroup.get(subGroup.id) ?? [])
      .map(id => idMap.get(id))
      .filter((node): node is ReactFlowNode => Boolean(node));
    if (children.length === 0) continue;

    const childIds = new Set(children.map(node => node.id));
    const childEdges = edges.filter(edge => (
      childIds.has(edge.source) && childIds.has(edge.target)
    ));
    const childPositions = layoutWithDagre(
      children,
      childEdges,
      subDomainNodeIsHorizontal ? 'LR' : 'TB',
      subDomainNodeIsHorizontal ? nodeGapV : nodeGapH,
      subDomainNodeIsHorizontal ? nodeGapH : nodeGapV,
      getNodeDimensions,
    );
    for (const position of childPositions) {
      const node = idMap.get(position.id);
      if (!node) continue;
      node.position = {
        x: position.x + subDomainPaddingH,
        y: position.y + subDomainTitleHeight + titleSafetyGap + subDomainPaddingV,
      };
    }

    const bounds = calculateBounds(children, getNodeDimensions, widthCompensation);
    const width = bounds.width + subDomainPaddingH * 2;
    const height = bounds.height
      + subDomainTitleHeight
      + titleSafetyGap
      + subDomainPaddingV * 2
      + subDomainPaddingBottom
      + 40;
    subGroup.measured = { width, height };
    subGroup.style = { ...subGroup.style, width, height };
  }

  const freeNodes = leafNodes.filter(node => !nodeToSubGroup.has(node.id));
  const topLevelItems = [...subGroups, ...freeNodes];
  const topLevelEdges = mapEdgesToContainers(edges, nodeToSubGroup);
  const topLevelPositions = layoutWithDagre(
    topLevelItems,
    topLevelEdges,
    domainSubGroupIsHorizontal ? 'LR' : 'TB',
    domainSubGroupIsHorizontal ? nodeGapV : nodeGapH,
    domainSubGroupIsHorizontal ? nodeGapH : nodeGapV,
    getNodeDimensions,
  );

  for (const position of topLevelPositions) {
    const item = idMap.get(position.id) as NodeWithAbsolutePosition | undefined;
    if (!item) continue;
    const absolutePosition = offsetPosition(position);
    if (String(item.type || '') === 'subGroup') {
      const deltaX = absolutePosition.x - item.position.x;
      const deltaY = absolutePosition.y - item.position.y;
      item.position = absolutePosition;
      item.positionAbsolute = absolutePosition;
      for (const childId of childrenBySubGroup.get(item.id) ?? []) {
        const child = idMap.get(childId) as NodeWithAbsolutePosition | undefined;
        if (!child) continue;
        child.position = {
          x: child.position.x + deltaX,
          y: child.position.y + deltaY,
        };
        child.positionAbsolute = { ...child.position };
      }
    } else {
      item.position = absolutePosition;
      item.positionAbsolute = absolutePosition;
    }
  }

  const validEdges = visibleLeafEdges(edges, leafNodes).map(edge => ({ ...edge }));
  applyDomainDagreEdgeRouting(nodes, validEdges, idMap, routingConfig, options);
  return {
    nodes: sortDomainDagreHierarchy(convertDomainDagreToHierarchy(nodes, nodeToSubGroup)),
    edges: separateParallelEdges(validEdges, 12),
  };
};

export const runDomainDagreSimplifiedPath = (
  context: DomainDagreSimplifiedPathContext,
): DomainDagreSimplifiedPathResult | null => {
  if (context.domains.length > 0) return null;
  return context.subGroups.length === 0
    ? layoutWithoutGroups(context)
    : layoutWithSubGroupsOnly(context);
};
