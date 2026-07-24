import type { Node as ReactFlowNode } from '@xyflow/react';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegativeNumber = (value: unknown, fallback: number): number =>
  Math.max(0, finiteNumber(value, fallback));

const domainKeyOf = (node: ReactFlowNode): string =>
  String((node.data as Record<string, unknown> | undefined)?.domain ?? '').trim();

const isHidden = (node: ReactFlowNode): boolean =>
  (node.data as Record<string, unknown> | undefined)?.hidden === true;

const boundsOf = (node: ReactFlowNode) => ({
  x: finiteNumber(node.position?.x, 0),
  y: finiteNumber(node.position?.y, 0),
  width: nonNegativeNumber(
    node.measured?.width ?? node.style?.width ?? node.width,
    0,
  ),
  height: nonNegativeNumber(
    node.measured?.height ?? node.style?.height ?? node.height,
    0,
  ),
});

/**
 * Reports whether any pair of visible subgroups in a declared title-group
 * domain overlaps after applying the requested horizontal safety gap.
 */
export const hasVisibleSubGroupOverlapWithinDomains = (
  nodes: readonly ReactFlowNode[],
  horizontalSafeGap: number,
): boolean => {
  const safeGap = nonNegativeNumber(horizontalSafeGap, 0);
  const domainKeys = new Set(
    nodes
      .filter(node => node.type === 'titleGroup')
      .map(domainKeyOf)
      .filter(Boolean),
  );

  for (const domainKey of domainKeys) {
    const subGroups = nodes.filter(node =>
      node.type === 'subGroup'
      && domainKeyOf(node) === domainKey
      && !isHidden(node));
    for (let leftIndex = 0; leftIndex < subGroups.length; leftIndex += 1) {
      const left = boundsOf(subGroups[leftIndex]);
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < subGroups.length;
        rightIndex += 1
      ) {
        const right = boundsOf(subGroups[rightIndex]);
        const disjoint = left.x >= right.x + right.width + safeGap
          || left.x + left.width + safeGap <= right.x
          || left.y >= right.y + right.height
          || left.y + left.height <= right.y;
        if (!disjoint) return true;
      }
    }
  }

  return false;
};
