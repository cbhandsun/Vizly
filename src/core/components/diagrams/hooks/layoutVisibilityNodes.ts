import type { Node } from '@xyflow/react';

import { buildChildrenMap, getDescendantIds } from './useCollapsibleGroups';

/** Propagates collapsed-container visibility into the graph staged for layout. */
export const normalizeLayoutVisibilityNodes = (rawNodes: Node[]): Node[] => {
  const collapsedGroups = rawNodes.filter(node => node.data?.collapsed);
  const childrenMap = buildChildrenMap(rawNodes);
  const hiddenNodeIds = new Set<string>();
  for (const group of collapsedGroups) {
    for (const id of getDescendantIds(rawNodes, group.id, childrenMap)) {
      hiddenNodeIds.add(id);
    }
  }
  return rawNodes.map((node) => {
    const hidden = hiddenNodeIds.has(node.id)
      || node.hidden === true
      || node.data?.hidden === true;
    return hidden
      ? { ...node, hidden: true, data: { ...node.data, hidden: true } }
      : { ...node, hidden: false };
  });
};
