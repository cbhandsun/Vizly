import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

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

const firstDefined = (...values: unknown[]): unknown => (
  values.find(value => value !== undefined && value !== null)
);

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const coordinate = (value: unknown, fallback = 0): number => (
  boundedNumber(value, fallback, -100_000, 100_000)
);

const dimension = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 1, 100_000)
);

const spacing = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 0, 10_000)
);

const cloneLayoutNodes = (nodes: ReactFlowNode[]): ReactFlowNode[] => nodes.map(node => ({
  ...node,
  position: {
    x: coordinate(node.position?.x),
    y: coordinate(node.position?.y),
  },
  data: node.data ? { ...node.data } : node.data,
  style: node.style ? { ...node.style } : node.style,
  measured: node.measured
    ? {
      width: dimension(node.measured.width, 1),
      height: dimension(node.measured.height, 1),
    }
    : node.measured,
}));

interface SubGroupPostProcessingMetrics {
  horizontalPadding: number;
  titleHeight: number;
  titlePadding: number;
  topPadding: number;
  titleSafeGap: number;
  bottomPadding: number;
  verticalGap: number;
}

const resolveMetrics = (
  layoutConfig: unknown,
  config: unknown,
): SubGroupPostProcessingMetrics => ({
  horizontalPadding: spacing(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'horizontal'),
    nestedValue(config, 'subGroup', 'padding', 'horizontal'),
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
  ), 24),
  titleHeight: spacing(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'height'),
    nestedValue(config, 'subGroup', 'title', 'height'),
  ), 32),
  titlePadding: spacing(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    nestedValue(config, 'subGroup', 'title', 'padding', 'vertical'),
  ), 8),
  topPadding: spacing(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subGroup', 'padding', 'top'),
  ), 12),
  titleSafeGap: spacing(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'safeGap'),
    nestedValue(config, 'subGroup', 'title', 'safeGap'),
  ), 0),
  bottomPadding: spacing(
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
    20,
  ),
  verticalGap: Math.max(
    8,
    spacing(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
  ),
});

const childIds = (node: ReactFlowNode): string[] => {
  const children = asRecord(node.data).children;
  return Array.isArray(children)
    ? children.filter((id): id is string => typeof id === 'string')
    : [];
};

const nodeWidth = (node: ReactFlowNode, fallback = 120): number => dimension(
  node.measured?.width ?? node.style?.width ?? node.width,
  fallback,
);

const nodeHeight = (node: ReactFlowNode, fallback = 80): number => dimension(
  node.measured?.height ?? node.style?.height ?? node.height,
  fallback,
);

export interface DagreSyncOptions {
  onNearTitleBoundary?: (childId: string, innerTop: number) => void;
}

export const syncDagreChildPositionsWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
  options: DagreSyncOptions = {},
): ReactFlowNode[] => {
  const metrics = resolveMetrics(layoutConfig, config);
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));
  const safeGap = Math.max(8, metrics.titleSafeGap);

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const innerLeft = subGroup.position.x + metrics.horizontalPadding;
    const innerTop = (
      subGroup.position.y
      + metrics.titleHeight
      + metrics.titlePadding
      + metrics.topPadding
      + safeGap
    );

    for (const childId of childIds(subGroup)) {
      const child = nodeById.get(childId);
      if (!child) continue;
      const relative = asRecord(asRecord(child.data).__dagreRel);
      const relativeX = relative.x;
      const relativeY = relative.y;
      if (
        typeof relativeX !== 'number'
        || !Number.isFinite(relativeX)
        || typeof relativeY !== 'number'
        || !Number.isFinite(relativeY)
      ) continue;

      const y = Math.round(coordinate(innerTop + coordinate(relativeY)));
      child.position = {
        x: Math.round(coordinate(innerLeft + coordinate(relativeX))),
        y,
      };
      if (Math.abs(y - innerTop) < 10) {
        options.onNearTitleBoundary?.(child.id, innerTop);
      }
    }
  }

  return updated;
};

export const enforceSubGroupTitleClearanceWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = resolveMetrics(layoutConfig, config);
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const children = childIds(subGroup)
      .map(id => nodeById.get(id))
      .filter((node): node is ReactFlowNode => Boolean(node))
      .sort((a, b) => a.position.y - b.position.y);
    if (!children.length) continue;

    const innerLeft = subGroup.position.x + metrics.horizontalPadding;
    const innerRight = (
      subGroup.position.x
      + nodeWidth(subGroup, 1)
      - metrics.horizontalPadding
    );
    const innerTop = (
      subGroup.position.y
      + metrics.titleHeight
      + metrics.titlePadding
      + metrics.topPadding
      + metrics.titleSafeGap
    );
    const innerBottom = (
      subGroup.position.y
      + nodeHeight(subGroup, 1)
      - metrics.bottomPadding
    );
    let cursorY = innerTop;

    for (const child of children) {
      const width = nodeWidth(child);
      const height = nodeHeight(child);
      const desiredY = child.position.y < innerTop ? cursorY : child.position.y;
      const x = Math.min(
        Math.max(child.position.x, innerLeft),
        Math.max(innerLeft, innerRight - width),
      );
      const y = Math.min(
        Math.max(desiredY, innerTop),
        Math.max(innerTop, innerBottom - height),
      );
      child.position = { x: Math.round(x), y: Math.round(y) };
      cursorY = Math.max(cursorY, desiredY + height + metrics.verticalGap);
    }
  }

  return updated;
};
