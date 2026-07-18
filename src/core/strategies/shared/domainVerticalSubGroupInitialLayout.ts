import type { Node as ReactFlowNode } from '@xyflow/react';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveNumber = (value: unknown, fallback: number): number => {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

const cloneNodes = (nodes: readonly ReactFlowNode[]): ReactFlowNode[] =>
  nodes.map(node => ({
    ...node,
    position: {
      x: finiteNumber(node.position?.x, 0),
      y: finiteNumber(node.position?.y, 0),
    },
    measured: node.measured ? { ...node.measured } : undefined,
    style: node.style ? { ...node.style } : undefined,
    data: { ...((node.data as Record<string, unknown> | undefined) ?? {}) },
  }));

const domainKeyOf = (node: ReactFlowNode): string =>
  String((node.data as Record<string, unknown> | undefined)?.domain ?? '').trim();

const semanticSubDomainKeyOf = (node: ReactFlowNode): string => {
  const data = node.data as Record<string, unknown> | undefined;
  const metadata = data?.metadata as Record<string, unknown> | undefined;
  return String(data?.subDomain ?? data?.subdomain ?? metadata?.subDomain ?? '').trim();
};

const subGroupSemanticKeyOf = (node: ReactFlowNode): string => {
  const data = node.data as Record<string, unknown> | undefined;
  return String(data?.description ?? data?.subDomain ?? node.id ?? '').trim();
};

const declaredChildIds = (node: ReactFlowNode): string[] => {
  const children = (node.data as Record<string, unknown> | undefined)?.children;
  if (!Array.isArray(children)) return [];
  return [...new Set(children.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  ))];
};

const writeSize = (node: ReactFlowNode, width: number, height: number): void => {
  const safeWidth = Math.max(0, finiteNumber(width, 0));
  const safeHeight = Math.max(0, finiteNumber(height, 0));
  node.style = { ...(node.style ?? {}), width: safeWidth, height: safeHeight };
  node.measured = { width: safeWidth, height: safeHeight };
  node.width = safeWidth;
  node.height = safeHeight;
};

export interface SubGroupInitialLayoutOptions {
  domainKey: string;
  subGroupHorizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
  horizontalGap: number;
  verticalGap: number;
  fallbackChildWidth: number;
  fallbackChildHeight: number;
  layoutChildren: (subGroup: ReactFlowNode, children: ReactFlowNode[]) => void;
  packChildren: (
    subGroup: ReactFlowNode,
    children: ReactFlowNode[],
    horizontalGap: number,
    verticalGap: number,
  ) => ReactFlowNode[];
  scatterCoincidentChildren: (
    children: ReactFlowNode[],
    horizontalGap: number,
  ) => void;
  resolveChildOverlaps: (children: ReactFlowNode[]) => void;
}

/**
 * Runs the initial visible-child layout transaction for all subgroups in one
 * domain, projects subgroup bounds, clamps children, and repairs semantic
 * child declarations.
 */
export const layoutInitialSubGroupsInDomain = (
  nodes: readonly ReactFlowNode[],
  rawOptions: SubGroupInitialLayoutOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  const domainKey = String(rawOptions.domainKey ?? '').trim();
  if (!domainKey) return updated;
  const horizontalPadding = Math.max(
    0,
    finiteNumber(rawOptions.subGroupHorizontalPadding, 0),
  );
  const topPadding = Math.max(0, finiteNumber(rawOptions.topPadding, 0));
  const bottomPadding = Math.max(0, finiteNumber(rawOptions.bottomPadding, 0));
  const horizontalGap = Math.max(0, finiteNumber(rawOptions.horizontalGap, 12));
  const verticalGap = Math.max(0, finiteNumber(rawOptions.verticalGap, 8));
  const fallbackChildWidth = positiveNumber(rawOptions.fallbackChildWidth, 240);
  const fallbackChildHeight = positiveNumber(rawOptions.fallbackChildHeight, 80);

  for (const subGroup of updated.filter(node =>
    node.type === 'subGroup' && domainKeyOf(node) === domainKey)) {
    const children = declaredChildIds(subGroup)
      .map(childId => nodeById.get(childId))
      .filter((child): child is ReactFlowNode =>
        Boolean(child)
        && (child?.data as Record<string, unknown> | undefined)?.hidden !== true);
    if (children.length === 0) continue;

    rawOptions.layoutChildren(subGroup, children);
    const packed = rawOptions.packChildren(
      subGroup,
      children,
      horizontalGap,
      verticalGap,
    );
    const packedPositions = new Map(
      (Array.isArray(packed) ? packed : [])
        .filter(node => node && typeof node.id === 'string')
        .map(node => [node.id, node.position] as const),
    );
    for (const child of children) {
      const projected = packedPositions.get(child.id);
      child.position = {
        x: Math.round(finiteNumber(projected?.x, child.position.x)),
        y: Math.round(finiteNumber(projected?.y, child.position.y)),
      };
    }
    rawOptions.scatterCoincidentChildren(children, horizontalGap);
    rawOptions.resolveChildOverlaps(children);
    for (const child of children) {
      child.position = {
        x: Math.round(finiteNumber(child.position?.x, 0)),
        y: Math.round(finiteNumber(child.position?.y, 0)),
      };
    }

    const minimumX = Math.min(...children.map(child => child.position.x));
    const minimumY = Math.min(...children.map(child => child.position.y));
    const maximumX = Math.max(...children.map(child =>
      child.position.x + positiveNumber(
        child.measured?.width ?? child.style?.width ?? child.width,
        fallbackChildWidth,
      )));
    const maximumY = Math.max(...children.map(child =>
      child.position.y + positiveNumber(
        child.measured?.height ?? child.style?.height ?? child.height,
        fallbackChildHeight,
      )));
    subGroup.position = {
      x: Math.round(minimumX - horizontalPadding),
      y: Math.round(minimumY - topPadding),
    };
    const projectedWidth = maximumX - minimumX + horizontalPadding * 2;
    const projectedHeight = maximumY - minimumY + topPadding + bottomPadding;
    const width = Math.max(
      positiveNumber(subGroup.measured?.width ?? subGroup.style?.width, 0),
      projectedWidth,
    );
    const height = Math.max(
      positiveNumber(subGroup.measured?.height ?? subGroup.style?.height, 0),
      projectedHeight,
    );
    writeSize(subGroup, width, height);

    const innerLeft = subGroup.position.x + horizontalPadding;
    const innerTop = subGroup.position.y + topPadding;
    const innerRight = innerLeft + Math.max(0, width - horizontalPadding * 2);
    const innerBottom = subGroup.position.y + height - bottomPadding;
    for (const child of children) {
      const childWidth = positiveNumber(
        child.measured?.width ?? child.style?.width ?? child.width,
        fallbackChildWidth,
      );
      const childHeight = positiveNumber(
        child.measured?.height ?? child.style?.height ?? child.height,
        fallbackChildHeight,
      );
      child.position = {
        x: Math.round(Math.max(
          innerLeft,
          Math.min(child.position.x, innerRight - childWidth),
        )),
        y: Math.round(Math.max(
          innerTop,
          Math.min(child.position.y, innerBottom - childHeight),
        )),
      };
    }
    subGroup.zIndex = typeof subGroup.zIndex === 'number' ? subGroup.zIndex : -5;

    const semanticKey = subGroupSemanticKeyOf(subGroup);
    if (!semanticKey) continue;
    const currentChildren = declaredChildIds(subGroup);
    const currentChildSet = new Set(currentChildren);
    const semanticChildren = updated
      .filter(node =>
        node.type !== 'titleGroup'
        && node.type !== 'subGroup'
        && domainKeyOf(node) === domainKey
        && semanticSubDomainKeyOf(node) === semanticKey)
      .map(node => node.id)
      .filter(id => !currentChildSet.has(id));
    if (semanticChildren.length > 0) {
      subGroup.data = {
        ...((subGroup.data as Record<string, unknown> | undefined) ?? {}),
        children: [...currentChildren, ...semanticChildren],
      };
    }
  }

  return updated;
};
