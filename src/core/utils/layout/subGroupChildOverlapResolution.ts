import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

interface OverlapMetrics {
  horizontalGap: number;
  verticalGap: number;
  horizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

const nestedValue = (source: unknown, ...keys: string[]): unknown => {
  let current: unknown = source;
  for (const key of keys) current = asRecord(current)[key];
  return current;
};

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum = -100_000,
  maximum = 100_000,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const dimension = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 0, 100_000)
);

const cloneNode = (node: ReactFlowNode): ReactFlowNode => ({
  ...node,
  position: {
    x: boundedNumber(node.position?.x, 0),
    y: boundedNumber(node.position?.y, 0),
  },
  data: node.data ? { ...node.data } : {},
  style: node.style ? { ...node.style } : {},
  measured: node.measured
    ? {
      width: dimension(node.measured.width, 0),
      height: dimension(node.measured.height, 0),
    }
    : node.measured,
});

const resolveMetrics = (
  horizontalGapOverride: unknown,
  verticalGapOverride: unknown,
  layoutConfig: unknown,
  config: unknown,
): OverlapMetrics => {
  const titleHeight = dimension(
    nestedValue(config, 'subDomain', 'title', 'height'),
    28,
  );
  const titlePadding = dimension(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    8,
  );
  return {
    horizontalGap: dimension(
      horizontalGapOverride,
      dimension(nestedValue(layoutConfig, 'NODE_H_GAP'), 120),
    ),
    verticalGap: dimension(
      verticalGapOverride,
      dimension(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
    ),
    horizontalPadding: dimension(
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
      30,
    ),
    topPadding: Math.max(
      titleHeight + titlePadding,
      dimension(
        nestedValue(layoutConfig, 'SUB_GROUP_TITLE_CLEARANCE'),
        titleHeight + titlePadding,
      ),
    ),
    bottomPadding: dimension(
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
      20,
    ),
  };
};

const nodeRect = (node: ReactFlowNode): Rect => ({
  x: boundedNumber(node.position?.x, 0),
  y: boundedNumber(node.position?.y, 0),
  width: dimension(node.measured?.width ?? node.style?.width ?? node.width, 0),
  height: dimension(node.measured?.height ?? node.style?.height ?? node.height, 0),
});

const overlapsHorizontally = (left: Rect, right: Rect): boolean => (
  left.x < right.x + right.width && left.x + left.width > right.x
);

const overlapsVertically = (left: Rect, right: Rect): boolean => (
  left.y < right.y + right.height && left.y + left.height > right.y
);

const hasValidDagreSize = (subGroup: ReactFlowNode): boolean => {
  const marker = asRecord(asRecord(subGroup.data).__dagreSized);
  return dimension(marker.h, 0) > 0;
};

const semanticChildren = (
  subGroup: ReactFlowNode,
  nodesById: Map<string, ReactFlowNode>,
): ReactFlowNode[] => {
  const childIds = asRecord(subGroup.data).children;
  if (!Array.isArray(childIds)) return [];
  const seen = new Set<string>();
  const children: ReactFlowNode[] = [];
  for (const childId of childIds) {
    if (typeof childId !== 'string' || seen.has(childId)) continue;
    seen.add(childId);
    const child = nodesById.get(childId);
    if (
      child
      && !CONTAINER_TYPES.has(String(child.type || ''))
      && !asRecord(child.data).hidden
    ) {
      children.push(child);
    }
  }
  return children;
};

const separateVertically = (
  children: ReactFlowNode[],
  gap: number,
): void => {
  const placed: Rect[] = [];
  for (const child of children.slice().sort(
    (left, right) => left.position.y - right.position.y,
  )) {
    const rect = nodeRect(child);
    let shift = 0;
    for (const previous of placed) {
      if (!overlapsHorizontally(rect, previous)) continue;
      shift = Math.max(
        shift,
        previous.y + previous.height + gap - rect.y,
      );
    }
    if (shift > 0) {
      child.position = {
        x: child.position.x,
        y: boundedNumber(child.position.y + shift, child.position.y),
      };
    }
    placed.push({ ...rect, y: rect.y + Math.max(0, shift) });
  }
};

const separateHorizontally = (
  children: ReactFlowNode[],
  gap: number,
): void => {
  const placed: Rect[] = [];
  for (const child of children.slice().sort(
    (left, right) => left.position.x - right.position.x,
  )) {
    const rect = nodeRect(child);
    let shift = 0;
    for (const previous of placed) {
      if (!overlapsVertically(rect, previous)) continue;
      shift = Math.max(
        shift,
        previous.x + previous.width + gap - rect.x,
      );
    }
    if (shift > 0) {
      child.position = {
        x: boundedNumber(child.position.x + shift, child.position.x),
        y: child.position.y,
      };
    }
    placed.push({ ...rect, x: rect.x + Math.max(0, shift) });
  }
};

const expandAndClamp = (
  subGroup: ReactFlowNode,
  children: ReactFlowNode[],
  metrics: OverlapMetrics,
): void => {
  const groupRect = nodeRect(subGroup);
  const innerLeft = groupRect.x + metrics.horizontalPadding;
  const innerTop = groupRect.y + metrics.topPadding;
  let requiredRight = innerLeft + 1;
  let requiredBottom = innerTop + 1;
  for (const child of children) {
    const rect = nodeRect(child);
    requiredRight = Math.max(requiredRight, rect.x + rect.width);
    requiredBottom = Math.max(requiredBottom, rect.y + rect.height);
  }
  const width = Math.round(Math.max(
    groupRect.width,
    requiredRight - groupRect.x + metrics.horizontalPadding,
  ));
  const height = Math.round(Math.max(
    groupRect.height,
    requiredBottom - groupRect.y + metrics.bottomPadding,
  ));
  subGroup.style = { ...subGroup.style, width, height };
  subGroup.measured = { width, height };
  subGroup.width = width;
  subGroup.height = height;
  const innerRight = groupRect.x + width - metrics.horizontalPadding;
  const innerBottom = groupRect.y + height - metrics.bottomPadding;
  for (const child of children) {
    const rect = nodeRect(child);
    child.position = {
      x: Math.round(Math.min(
        Math.max(rect.x, innerLeft),
        Math.max(innerLeft, innerRight - rect.width),
      )),
      y: Math.round(Math.min(
        Math.max(rect.y, innerTop),
        Math.max(innerTop, innerBottom - rect.height),
      )),
    };
  }
};

export const resolveSubGroupChildrenOverlapsWithConfig = (
  nodeInputs: ReactFlowNode[],
  horizontalGapOverride: unknown,
  verticalGapOverride: unknown,
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const nodesById = new Map(updated.map(node => [node.id, node]));
  const metrics = resolveMetrics(
    horizontalGapOverride,
    verticalGapOverride,
    layoutConfig,
    config,
  );

  for (const subGroup of updated.filter(
    node => String(node.type || '') === 'subGroup',
  )) {
    if (hasValidDagreSize(subGroup)) continue;
    const children = semanticChildren(subGroup, nodesById);
    if (children.length <= 1) continue;
    separateVertically(children, metrics.verticalGap);
    separateHorizontally(children, metrics.horizontalGap);
    expandAndClamp(subGroup, children, metrics);
  }

  return updated;
};
