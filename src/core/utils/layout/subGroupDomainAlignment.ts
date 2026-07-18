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
  measured: node.measured ? { ...node.measured } : node.measured,
}));

const domainId = (node: ReactFlowNode): string => String(asRecord(node.data).domain || '');

const isVisibleSubGroup = (node: ReactFlowNode, expectedDomainId: string): boolean => (
  String(node.type || '') === 'subGroup'
  && domainId(node) === expectedDomainId
  && asRecord(node.data).hidden !== true
);

const childIds = (node: ReactFlowNode): string[] => {
  const children = asRecord(node.data).children;
  return Array.isArray(children)
    ? children.filter((id): id is string => typeof id === 'string')
    : [];
};

const nodeWidth = (node: ReactFlowNode): number => boundedDimension(
  node.measured?.width ?? node.style?.width ?? node.width,
);

const nodeHeight = (node: ReactFlowNode): number => boundedDimension(
  node.measured?.height ?? node.style?.height ?? node.height,
);

const moveChildren = (
  subGroup: ReactFlowNode,
  nodeById: Map<string, ReactFlowNode>,
  deltaX: number,
  deltaY: number,
): void => {
  if (deltaX === 0 && deltaY === 0) return;
  for (const childId of childIds(subGroup)) {
    const child = nodeById.get(childId);
    if (!child) continue;
    child.position = {
      x: Math.round(boundedNumber(child.position?.x, 0) + deltaX),
      y: Math.round(boundedNumber(child.position?.y, 0) + deltaY),
    };
  }
};

interface DomainMetrics {
  horizontalPadding: number;
  sideSafeGap: number;
  titleOffset: number;
  subGroupHorizontalPadding: number;
  verticalGap: number;
}

const resolveDomainMetrics = (layoutConfig: unknown, config: unknown): DomainMetrics => ({
  horizontalPadding: boundedDimension(nestedValue(config, 'domain', 'padding', 'horizontal'), 24),
  sideSafeGap: boundedDimension(nestedValue(config, 'domain', 'sideSafeGap'), 8),
  titleOffset: (
    boundedDimension(nestedValue(config, 'domain', 'title', 'height'), 40)
    + boundedDimension(nestedValue(config, 'domain', 'title', 'padding', 'vertical'), 12)
    + boundedDimension(nestedValue(config, 'domain', 'title', 'safeGap'), 16)
  ),
  subGroupHorizontalPadding: boundedDimension(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'horizontal'),
    nestedValue(config, 'subGroup', 'padding', 'horizontal'),
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
  ), 30),
  verticalGap: boundedDimension(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
});

export const unifySubGroupLeftAnchorsWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = resolveDomainMetrics(layoutConfig, config);
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    if (!id) continue;
    const targetX = domain.position.x
      + metrics.horizontalPadding
      + metrics.sideSafeGap
      - metrics.subGroupHorizontalPadding;

    for (const subGroup of updated.filter(node => isVisibleSubGroup(node, id))) {
      const oldX = subGroup.position.x;
      subGroup.position = { x: targetX, y: subGroup.position.y };
      moveChildren(subGroup, nodeById, Math.round(targetX - oldX), 0);
    }
  }

  return updated;
};

export const stackSubGroupsVerticallyWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = resolveDomainMetrics(layoutConfig, config);
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    if (!id) continue;

    const subGroups = updated
      .filter(node => isVisibleSubGroup(node, id))
      .sort((a, b) => {
        const aData = asRecord(a.data);
        const bData = asRecord(b.data);
        const aOrder = Number(aData.sequence ?? aData.order);
        const bOrder = Number(bData.sequence ?? bData.order);
        const hasA = Number.isFinite(aOrder);
        const hasB = Number.isFinite(bOrder);
        if (hasA && hasB) return aOrder - bOrder;
        if (hasA) return -1;
        if (hasB) return 1;
        return a.position.y - b.position.y;
      });

    let cursorY = domain.position.y + metrics.titleOffset;
    for (const subGroup of subGroups) {
      const oldY = subGroup.position.y;
      subGroup.position = { x: subGroup.position.x, y: cursorY };
      moveChildren(subGroup, nodeById, 0, cursorY - oldY);
      cursorY += nodeHeight(subGroup) + metrics.verticalGap;
    }
  }

  return updated;
};

export const expandSubGroupsToDomainWidthWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const metrics = resolveDomainMetrics(layoutConfig, config);
  const updated = cloneLayoutNodes(nodes);

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    if (!id) continue;

    const availableWidth = Math.max(
      0,
      nodeWidth(domain) - 2 * metrics.horizontalPadding,
    );
    const targetX = domain.position.x
      + metrics.horizontalPadding
      - metrics.subGroupHorizontalPadding;

    for (const subGroup of updated.filter(node => isVisibleSubGroup(node, id))) {
      const height = nodeHeight(subGroup);
      const width = Math.max(nodeWidth(subGroup), availableWidth);
      subGroup.position = { x: targetX, y: subGroup.position.y };
      subGroup.style = { ...subGroup.style, width, height };
      subGroup.measured = { width, height };
      subGroup.width = width;
    }
  }

  return updated;
};

export const centerSubGroupsInDomainWithConfig = (
  nodes: ReactFlowNode[],
  config: unknown,
): ReactFlowNode[] => {
  const metrics = resolveDomainMetrics({}, config);
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    const width = nodeWidth(domain);
    if (!id || width <= 0) continue;

    const subGroups = updated.filter(node => (
      String(node.type || '') === 'subGroup'
      && asRecord(node.data).hidden !== true
      && (node.parentId === domain.id || domainId(node) === id)
    ));
    if (!subGroups.length) continue;

    const contentMinX = Math.min(...subGroups.map(node => node.position.x));
    const contentMaxX = Math.max(...subGroups.map(node => node.position.x + nodeWidth(node)));
    const contentWidth = contentMaxX - contentMinX;
    if (!Number.isFinite(contentWidth) || contentWidth <= 0) continue;

    const targetMinX = domain.position.x + (width - contentWidth) / 2;
    const deltaX = Math.round(targetMinX - contentMinX);
    if (contentMinX + deltaX < domain.position.x + metrics.horizontalPadding) continue;
    if (deltaX === 0) continue;

    for (const subGroup of subGroups) {
      subGroup.position = {
        x: subGroup.position.x + deltaX,
        y: subGroup.position.y,
      };
      moveChildren(subGroup, nodeById, deltaX, 0);
    }
  }

  return updated;
};
