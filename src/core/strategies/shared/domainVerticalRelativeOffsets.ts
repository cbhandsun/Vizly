import type { Node as ReactFlowNode } from '@xyflow/react';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const declaredChildIds = (subGroup: ReactFlowNode): string[] => {
  const children = (
    subGroup.data as Record<string, unknown> | undefined
  )?.children;
  if (!Array.isArray(children)) return [];
  return children.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
};

/**
 * Records visible child positions relative to their subgroup container origin.
 *
 * The origin intentionally differs from the generic projection helper, which
 * measures from the subgroup content area. Rigid row packing consumes this
 * container-origin offset for row bucketing and stable sibling ordering.
 */
export const snapshotVisibleSubGroupChildOriginOffsets = (
  nodes: readonly ReactFlowNode[],
): ReactFlowNode[] => {
  const updated = nodes.map(node => ({
    ...node,
    position: {
      x: finiteNumber(node.position?.x, 0),
      y: finiteNumber(node.position?.y, 0),
    },
    data: { ...((node.data as Record<string, unknown> | undefined) ?? {}) },
  }));
  const nodeById = new Map(updated.map(node => [node.id, node] as const));

  for (const subGroup of updated.filter(node => node.type === 'subGroup')) {
    const originX = finiteNumber(subGroup.position?.x, 0);
    const originY = finiteNumber(subGroup.position?.y, 0);
    for (const childId of declaredChildIds(subGroup)) {
      const child = nodeById.get(childId);
      if (!child || child.data?.hidden === true) continue;
      child.data = {
        ...(child.data ?? {}),
        __rel: {
          x: Math.round(finiteNumber(child.position?.x, originX) - originX),
          y: Math.round(finiteNumber(child.position?.y, originY) - originY),
        },
      };
    }
  }

  return updated;
};
