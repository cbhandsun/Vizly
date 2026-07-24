import type { Node as ReactFlowNode } from '@xyflow/react';

import {
  collectVisibleSubGroupChildren,
} from './domainVerticalSubGroupChildLayout';
import type {
  DomainVerticalPrimitiveLayout,
} from './domainVerticalNodeLayoutPrimitives';

export interface DomainVerticalTerminalAlignmentHandlers {
  alignHorizontal: (
    children: ReactFlowNode[],
    subGroup: ReactFlowNode,
  ) => void;
  scatterHorizontally: (
    children: ReactFlowNode[],
    minimumGap: number,
  ) => void;
  alignVerticalStack: (children: ReactFlowNode[]) => void;
  alignGridRows: (children: ReactFlowNode[]) => void;
}

export interface DomainVerticalTerminalAlignmentOptions {
  layout: DomainVerticalPrimitiveLayout;
  horizontalGap: number;
  handlers: DomainVerticalTerminalAlignmentHandlers;
}

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Applies the final visual alignment pass to visible subgroup children.
 *
 * Dagre is explicitly excluded: its edge-aware hierarchy must not be scattered
 * or row-aligned by a generic terminal pass.
 */
export const alignDomainVerticalTerminalSubGroupChildren = (
  nodes: ReactFlowNode[],
  rawOptions: DomainVerticalTerminalAlignmentOptions,
): ReactFlowNode[] => {
  if (rawOptions.layout === 'dagre') return nodes;
  const minimumGap = Math.max(
    12,
    Math.floor(finiteNumber(rawOptions.horizontalGap, 120)),
  );
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));

  for (const subGroup of nodes.filter(node => node.type === 'subGroup')) {
    const children = collectVisibleSubGroupChildren(subGroup, nodeById);
    if (children.length === 0) continue;
    if (rawOptions.layout === 'horizontal') {
      rawOptions.handlers.alignHorizontal(children, subGroup);
      continue;
    }
    rawOptions.handlers.scatterHorizontally(children, minimumGap);
    if (rawOptions.layout === 'vertical') {
      rawOptions.handlers.alignVerticalStack(children);
    } else {
      rawOptions.handlers.alignGridRows(children);
    }
  }
  return nodes;
};
