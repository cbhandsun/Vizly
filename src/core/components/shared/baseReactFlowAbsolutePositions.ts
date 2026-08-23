import type { Node, XYPosition } from '@xyflow/react';

type DisplayNode = Node & {
  positionAbsolute?: XYPosition;
};

/** Resolve nested React Flow coordinates without importing the routing engine. */
export const withDisplayAbsolutePositions = (
  nodes: Node[],
  nodeById: Map<string, Node>,
): Node[] => {
  const finiteNumber = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  );
  const resolvePosition = (node: Node, seen = new Set<string>()): XYPosition => {
    const measuredAbsolute = (node as DisplayNode).positionAbsolute;
    if (
      measuredAbsolute
      && typeof measuredAbsolute.x === 'number'
      && Number.isFinite(measuredAbsolute.x)
      && typeof measuredAbsolute.y === 'number'
      && Number.isFinite(measuredAbsolute.y)
    ) {
      return { x: measuredAbsolute.x, y: measuredAbsolute.y };
    }
    const localPosition = node.position ?? { x: 0, y: 0 };
    const local = {
      x: finiteNumber(localPosition.x, 0),
      y: finiteNumber(localPosition.y, 0),
    };
    if (!node.parentId || seen.has(node.parentId)) return local;
    const parent = nodeById.get(node.parentId);
    if (!parent) return local;
    seen.add(node.parentId);
    const parentPosition = resolvePosition(parent, seen);
    return {
      x: parentPosition.x + local.x,
      y: parentPosition.y + local.y,
    };
  };

  return nodes.map(node => ({
    ...node,
    positionAbsolute: resolvePosition(node),
  }) as Node);
};
