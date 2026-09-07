import type { Node } from '@xyflow/react';
import { getDisplayNodeRect, isDisplayContainerNode } from '../shared/baseReactFlowDisplayGeometry';
import { withDisplayAbsolutePositions } from '../shared/baseReactFlowAbsolutePositions';
import type { EdgeLabelRect } from './edgeLabelAvoidance';

/** A collapsed container is a visible endpoint entity. Expanded containers
 * remain permeable so labels on their internal branches can stay inside. This
 * presentation boundary deliberately does not change routing obstacles. */
export const buildEdgeLabelObstacles = (nodes: readonly Node[]): EdgeLabelRect[] => {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visible = nodes.filter(node => {
    if (node.hidden === true || (isDisplayContainerNode(node) && node.data?.collapsed !== true)) return false;
    const visited = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId) {
      if (visited.has(parentId)) return false;
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (parent.hidden === true || (isDisplayContainerNode(parent) && parent.data?.collapsed === true)) return false;
      parentId = parent.parentId;
    }
    return true;
  });
  return withDisplayAbsolutePositions(visible, byId).flatMap(node => {
    const rect = getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
};
