import type { Edge, Node } from '@xyflow/react';
import {
  calculateBounds,
  layoutWithDagre,
  mapEdgesToContainers,
} from './DomainDagreLayoutHelpers';
import {
  domainDagreDomainOf,
  sortDomainDagreSubGroups,
} from './domainDagreHierarchy';
import type { DomainDagreSubDomainOrder } from './domainDagreLayoutBoundary';
import {
  arrangeDomainDagreChildren,
  type DomainDagreNodeArrangement,
} from './domainDagreChildArrangement';

type NodeDimensions = (node: Node) => { width: number; height: number };

export interface DomainDagreNestedLayoutContext {
  domains: Node[];
  subGroups: Node[];
  leafNodes: Node[];
  edges: Edge[];
  nodeById: Map<string, Node>;
  childrenBySubGroup: Map<string, string[]>;
  nodeToSubGroup: Map<string, string>;
  subDomainOrder?: DomainDagreSubDomainOrder;
  subDomainNodeIsHorizontal: boolean;
  nodeArrangement: DomainDagreNodeArrangement;
  domainSubGroupIsHorizontal: boolean;
  packVerticalSubDomains: boolean;
  nodeGapH: number;
  nodeGapV: number;
  subDomainPaddingH: number;
  subDomainPaddingV: number;
  subDomainTitleHeight: number;
  domainPaddingH: number;
  domainPaddingV: number;
  domainTitleHeight: number;
  titleSafetyGap: number;
  bottomSafetyGap: number;
  globalBottomSafetyGap: number;
  widthCompensation: number;
  getNodeDimensions: NodeDimensions;
}

const setNodeSize = (node: Node, width: number, height: number): void => {
  node.measured = { width, height };
  node.style = { ...node.style, width, height };
};

const childrenFor = (
  subGroup: Node,
  childrenBySubGroup: Map<string, string[]>,
  nodeById: Map<string, Node>,
): Node[] => (childrenBySubGroup.get(subGroup.id) ?? [])
  .map(id => nodeById.get(id))
  .filter((node): node is Node => Boolean(node));

const edgesWithin = (edges: Edge[], nodes: Node[]): Edge[] => {
  const ids = new Set(nodes.map(node => node.id));
  return edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
};

const moveSubGroupChildren = (
  subGroup: Node,
  deltaX: number,
  deltaY: number,
  context: DomainDagreNestedLayoutContext,
): void => {
  for (const childId of context.childrenBySubGroup.get(subGroup.id) ?? []) {
    const child = context.nodeById.get(childId);
    if (!child) continue;
    child.position = {
      x: child.position.x + deltaX,
      y: child.position.y + deltaY,
    };
  }
};

const layoutSubGroupChildren = (
  subGroup: Node,
  context: DomainDagreNestedLayoutContext,
): void => {
  const children = childrenFor(subGroup, context.childrenBySubGroup, context.nodeById);
  if (children.length === 0) return;
  const positions = arrangeDomainDagreChildren(
    children,
    edgesWithin(context.edges, children),
    context.nodeArrangement,
    context.subDomainNodeIsHorizontal,
    context.nodeGapH,
    context.nodeGapV,
    context.getNodeDimensions,
  );
  for (const position of positions) {
    const node = context.nodeById.get(position.id);
    if (!node) continue;
    node.position = {
      x: position.x + context.subDomainPaddingH,
      y: position.y + context.subDomainTitleHeight + context.subDomainPaddingV,
    };
  }
  const bounds = calculateBounds(children, context.getNodeDimensions, context.widthCompensation);
  setNodeSize(
    subGroup,
    bounds.width + context.subDomainPaddingH * 2,
    bounds.height + context.subDomainTitleHeight + context.subDomainPaddingV * 2,
  );
};

export const runDomainDagreNestedLayout = (
  context: DomainDagreNestedLayoutContext,
): void => {
  for (const domain of context.domains) domain.position = { x: 0, y: 0 };

  for (const domain of context.domains) {
    const domainKey = domainDagreDomainOf(domain);
    const domainSubGroups = sortDomainDagreSubGroups(
      context.subGroups.filter(subGroup => domainDagreDomainOf(subGroup) === domainKey),
      domainKey,
      context.subDomainOrder,
    );
    const freeNodes = context.leafNodes.filter(node => (
      domainDagreDomainOf(node) === domainKey && !context.nodeToSubGroup.has(node.id)
    ));
    for (const subGroup of domainSubGroups) layoutSubGroupChildren(subGroup, context);

    const domainChildren = [...domainSubGroups, ...freeNodes];
    if (domainChildren.length === 0) continue;
    const domainChildIds = new Set(domainChildren.map(node => node.id));
    const domainEdges = context.edges.filter(edge => {
      const source = context.nodeById.get(edge.source);
      const target = context.nodeById.get(edge.target);
      if (!source || !target) return false;
      if (domainDagreDomainOf(source) !== domainKey || domainDagreDomainOf(target) !== domainKey) return false;
      const sourceItem = context.nodeToSubGroup.get(edge.source) || edge.source;
      const targetItem = context.nodeToSubGroup.get(edge.target) || edge.target;
      return domainChildIds.has(sourceItem) && domainChildIds.has(targetItem);
    });
    const positions = layoutWithDagre(
      domainChildren,
      mapEdgesToContainers(domainEdges, context.nodeToSubGroup),
      context.domainSubGroupIsHorizontal ? 'LR' : 'TB',
      context.domainSubGroupIsHorizontal ? context.nodeGapV : context.nodeGapH,
      context.domainSubGroupIsHorizontal ? context.nodeGapH : context.nodeGapV,
      context.getNodeDimensions,
    );
    for (const position of positions) {
      const node = context.nodeById.get(position.id);
      if (!node) continue;
      const newX = position.x + context.domainPaddingH;
      const newY = position.y
        + context.domainTitleHeight
        + context.titleSafetyGap
        + context.domainPaddingV;
      if (String(node.type || '') === 'subGroup') {
        moveSubGroupChildren(node, newX - node.position.x, newY - node.position.y, context);
      }
      node.position = { x: newX, y: newY };
    }

    if (context.domainSubGroupIsHorizontal && domainSubGroups.length > 1) {
      const rowY = Math.min(...domainSubGroups.map(subGroup => subGroup.position.y));
      let cursorX = context.domainPaddingH;
      for (const subGroup of domainSubGroups) {
        const deltaX = cursorX - subGroup.position.x;
        const deltaY = rowY - subGroup.position.y;
        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          moveSubGroupChildren(subGroup, deltaX, deltaY, context);
          subGroup.position = { x: cursorX, y: rowY };
        }
        cursorX += context.getNodeDimensions(subGroup).width + context.nodeGapH;
      }
    } else if (context.packVerticalSubDomains && domainSubGroups.length > 1) {
      const columnX = Math.min(...domainSubGroups.map(subGroup => subGroup.position.x));
      let cursorY = Math.min(...domainSubGroups.map(subGroup => subGroup.position.y));
      for (const subGroup of domainSubGroups) {
        const deltaX = columnX - subGroup.position.x;
        const deltaY = cursorY - subGroup.position.y;
        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          moveSubGroupChildren(subGroup, deltaX, deltaY, context);
          subGroup.position = { x: columnX, y: cursorY };
        }
        cursorY += context.getNodeDimensions(subGroup).height + context.nodeGapV;
      }
    }

    const bounds = calculateBounds(domainChildren, context.getNodeDimensions, context.widthCompensation);
    setNodeSize(
      domain,
      bounds.width + context.domainPaddingH * 2,
      bounds.height
        + context.domainTitleHeight
        + context.titleSafetyGap
        + context.domainPaddingV * 2
        + context.bottomSafetyGap
        + context.globalBottomSafetyGap,
    );
  }
};
