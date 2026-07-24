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

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum = -100_000,
  maximum = 100_000,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const boundedDimension = (value: unknown, fallback = 0): number => (
  boundedNumber(value, fallback, 0, 100_000)
);

const cloneLayoutNodes = (nodes: ReactFlowNode[]): ReactFlowNode[] => nodes.map(node => ({
  ...node,
  position: {
    x: boundedNumber(node.position?.x, 0),
    y: boundedNumber(node.position?.y, 0),
  },
  style: node.style ? { ...node.style } : node.style,
  measured: node.measured
    ? {
      width: boundedDimension(node.measured.width),
      height: boundedDimension(node.measured.height),
    }
    : node.measured,
}));

const domainId = (node: ReactFlowNode): string => String(asRecord(node.data).domain || '');

const nodeWidth = (node: ReactFlowNode): number => boundedDimension(
  node.measured?.width ?? node.style?.width ?? node.width,
);

const nodeHeight = (node: ReactFlowNode): number => boundedDimension(
  node.measured?.height ?? node.style?.height ?? node.height,
);

const visibleSubGroups = (
  nodes: ReactFlowNode[],
  expectedDomainId: string,
): ReactFlowNode[] => nodes.filter(node => (
  String(node.type || '') === 'subGroup'
  && domainId(node) === expectedDomainId
  && asRecord(node.data).hidden !== true
));

const childIds = (node: ReactFlowNode): string[] => {
  const children = asRecord(node.data).children;
  return Array.isArray(children)
    ? children.filter((id): id is string => typeof id === 'string')
    : [];
};

const setDimensions = (
  node: ReactFlowNode,
  width: number,
  height: number,
): void => {
  node.style = { ...node.style, width, height };
  node.measured = { width, height };
  node.width = width;
  node.height = height;
};

export const unifySubGroupHeightsByDomainWithConfig = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => {
  const updated = cloneLayoutNodes(nodes);

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    if (!id) continue;
    const subGroups = visibleSubGroups(updated, id);
    if (!subGroups.length) continue;

    const maximumHeight = Math.max(...subGroups.map(nodeHeight));
    for (const subGroup of subGroups) {
      setDimensions(subGroup, nodeWidth(subGroup), maximumHeight);
    }
  }

  return updated;
};

export const unifySubGroupWidthsByDomainWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
  alignmentPreference: unknown,
): ReactFlowNode[] => {
  const updated = cloneLayoutNodes(nodes);
  const horizontalPadding = boundedDimension(
    nestedValue(config, 'domain', 'padding', 'horizontal'),
    24,
  );
  const sideSafeGap = boundedDimension(
    nestedValue(config, 'domain', 'sideSafeGap'),
    8,
  );
  const minimumWidth = boundedDimension(
    nestedValue(layoutConfig, 'NODE_MIN_WIDTH'),
    120,
  );
  const alignment = typeof alignmentPreference === 'string'
    ? alignmentPreference.trim().toLowerCase()
    : 'center';

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    if (!id) continue;
    const subGroups = visibleSubGroups(updated, id);
    if (!subGroups.length) continue;

    const availableWidth = Math.max(1, nodeWidth(domain) - 2 * horizontalPadding);
    const targetContentWidth = Math.max(1, availableWidth - 2 * sideSafeGap);
    const maximumCurrentWidth = Math.max(...subGroups.map(nodeWidth));
    const unifiedWidth = alignment === 'center'
      ? Math.max(minimumWidth, targetContentWidth)
      : Math.max(minimumWidth, Math.min(maximumCurrentWidth, targetContentWidth));

    for (const subGroup of subGroups) {
      setDimensions(subGroup, unifiedWidth, nodeHeight(subGroup));
    }
  }

  return updated;
};

export const equalizeSubGroupMarginsByProjectionWithConfig = (
  nodes: ReactFlowNode[],
  config: unknown,
): ReactFlowNode[] => {
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));
  const horizontalPadding = boundedDimension(
    nestedValue(config, 'domain', 'padding', 'horizontal'),
    24,
  );

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    if (!id) continue;

    const innerLeft = domain.position.x + horizontalPadding;
    const innerRight = domain.position.x + Math.max(1, nodeWidth(domain)) - horizontalPadding;
    for (const subGroup of visibleSubGroups(updated, id)) {
      const width = nodeWidth(subGroup);
      const leftMargin = Math.max(0, subGroup.position.x - innerLeft);
      const rightMargin = Math.max(0, innerRight - (subGroup.position.x + width));
      const desiredShift = Math.round((rightMargin - leftMargin) / 2);
      const maximumX = Math.max(innerLeft, innerRight - width);
      const nextX = Math.min(
        Math.max(subGroup.position.x + desiredShift, innerLeft),
        maximumX,
      );
      const appliedShift = Math.round(nextX - subGroup.position.x);
      if (appliedShift === 0) continue;

      subGroup.position = { x: nextX, y: subGroup.position.y };
      for (const childId of childIds(subGroup)) {
        const child = nodeById.get(childId);
        if (!child) continue;
        child.position = {
          x: Math.round(child.position.x + appliedShift),
          y: child.position.y,
        };
      }
    }
  }

  return updated;
};
