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
    data: { ...((node.data as Record<string, unknown> | undefined) ?? {}) },
  }));

const domainKeyOf = (node: ReactFlowNode): string =>
  String((node.data as Record<string, unknown> | undefined)?.domain ?? '').trim();

const childIdsOf = (node: ReactFlowNode): string[] => {
  const children = (node.data as Record<string, unknown> | undefined)?.children;
  if (!Array.isArray(children)) return [];
  return [...new Set(children.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  ))];
};

const nodeHeight = (node: ReactFlowNode, fallback: number): number => {
  const data = node.data as Record<string, unknown> | undefined;
  const dagreSize = data?.__dagreSized as Record<string, unknown> | undefined;
  return positiveNumber(
    dagreSize?.h ?? node.measured?.height ?? node.style?.height ?? node.height,
    fallback,
  );
};

const nodeWidth = (node: ReactFlowNode, fallback: number): number =>
  positiveNumber(
    node.measured?.width ?? node.style?.width ?? node.width,
    fallback,
  );

const translateNode = (node: ReactFlowNode, deltaX: number, deltaY: number): void => {
  node.position = {
    x: Math.round(finiteNumber(node.position?.x, 0) + deltaX),
    y: Math.round(finiteNumber(node.position?.y, 0) + deltaY),
  };
  const data = node.data as Record<string, unknown>;
  const legacyPosition = data.position;
  if (legacyPosition && typeof legacyPosition === 'object') {
    const position = legacyPosition as Record<string, unknown>;
    data.position = {
      x: Math.round(finiteNumber(position.x, 0) + deltaX),
      y: Math.round(finiteNumber(position.y, 0) + deltaY),
    };
  }
};

const translateDomainInPlace = (
  nodes: readonly ReactFlowNode[],
  domainKey: string,
  deltaX: number,
  deltaY: number,
): void => {
  const safeDeltaX = finiteNumber(deltaX, 0);
  const safeDeltaY = finiteNumber(deltaY, 0);
  const normalizedDomain = String(domainKey ?? '').trim();
  if (!normalizedDomain || (safeDeltaX === 0 && safeDeltaY === 0)) return;

  for (const node of nodes) {
    if (domainKeyOf(node) === normalizedDomain) {
      translateNode(node, safeDeltaX, safeDeltaY);
    }
  }
};

export const translateDeclaredSubGroupChildrenInPlace = (
  nodeById: ReadonlyMap<string, ReactFlowNode>,
  subGroup: ReactFlowNode,
  deltaX: number,
  deltaY: number,
): void => {
  const safeDeltaX = finiteNumber(deltaX, 0);
  const safeDeltaY = finiteNumber(deltaY, 0);
  if (safeDeltaX === 0 && safeDeltaY === 0) return;
  for (const childId of childIdsOf(subGroup)) {
    const child = nodeById.get(childId);
    if (child) translateNode(child, safeDeltaX, safeDeltaY);
  }
};

export const translateSubGroupRigidlyInPlace = (
  nodeById: ReadonlyMap<string, ReactFlowNode>,
  subGroup: ReactFlowNode,
  deltaX: number,
  deltaY: number,
): void => {
  const safeDeltaX = finiteNumber(deltaX, 0);
  const safeDeltaY = finiteNumber(deltaY, 0);
  if (safeDeltaX === 0 && safeDeltaY === 0) return;
  translateNode(subGroup, safeDeltaX, safeDeltaY);
  translateDeclaredSubGroupChildrenInPlace(
    nodeById,
    subGroup,
    safeDeltaX,
    safeDeltaY,
  );
};

export const translateDomainRigidly = (
  nodes: readonly ReactFlowNode[],
  domainKey: string,
  deltaX: number,
  deltaY: number,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  translateDomainInPlace(updated, domainKey, deltaX, deltaY);
  return updated;
};

export interface DomainVerticalStackOptions {
  top?: number;
  gap: number;
  domainOrder?: readonly string[];
  containerTypes?: readonly string[] | ReadonlySet<string>;
  sortBy?: 'input' | 'position';
  mode?: 'exact' | 'push-down';
  anchor?: 'top' | 'first-current';
  includeHiddenDomains?: boolean;
  fallbackHeight?: number;
  markFinalizedDomains?: boolean;
}

export interface DomainHorizontalAlignmentOptions {
  left: number;
  containerTypes?: readonly string[] | ReadonlySet<string>;
  includeHiddenDomains?: boolean;
}

export interface DomainHorizontalCenteringOptions {
  horizontalPadding: number;
  containerTypes?: readonly string[] | ReadonlySet<string>;
  fallbackContainerWidth?: number;
  fallbackMemberWidth?: number;
}

/**
 * Aligns one representative container per domain to a shared left edge and
 * rigidly translates all domain members by the same horizontal delta.
 */
export const alignDomainsToLeftAnchor = (
  nodes: readonly ReactFlowNode[],
  rawOptions: DomainHorizontalAlignmentOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const left = Math.round(finiteNumber(rawOptions.left, 0));
  const allowedContainerTypes = new Set(
    rawOptions.containerTypes
      ? [...rawOptions.containerTypes].filter(type => typeof type === 'string' && type.length > 0)
      : ['titleGroup'],
  );
  const seenDomains = new Set<string>();

  for (const container of updated) {
    if (!allowedContainerTypes.has(String(container.type ?? ''))) continue;
    const data = container.data as Record<string, unknown> | undefined;
    if (rawOptions.includeHiddenDomains === false && data?.hidden === true) continue;
    const domainKey = domainKeyOf(container);
    if (!domainKey || seenDomains.has(domainKey)) continue;
    seenDomains.add(domainKey);
    translateDomainInPlace(
      updated,
      domainKey,
      left - finiteNumber(container.position?.x, 0),
      0,
    );
  }

  return updated;
};

/**
 * Centers the visible non-container members of each domain as one rigid
 * horizontal projection when the container has spare inner width.
 */
export const centerVisibleDomainMembersHorizontally = (
  nodes: readonly ReactFlowNode[],
  rawOptions: DomainHorizontalCenteringOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const horizontalPadding = Math.max(0, finiteNumber(rawOptions.horizontalPadding, 0));
  const fallbackContainerWidth = positiveNumber(rawOptions.fallbackContainerWidth, 100);
  const fallbackMemberWidth = positiveNumber(rawOptions.fallbackMemberWidth, 240);
  const allowedContainerTypes = new Set(
    rawOptions.containerTypes
      ? [...rawOptions.containerTypes].filter(type => typeof type === 'string' && type.length > 0)
      : ['titleGroup'],
  );
  const seenDomains = new Set<string>();

  for (const container of updated) {
    if (!allowedContainerTypes.has(String(container.type ?? ''))) continue;
    const domainKey = domainKeyOf(container);
    if (!domainKey || seenDomains.has(domainKey)) continue;
    seenDomains.add(domainKey);

    const containerX = finiteNumber(container.position?.x, 0);
    const containerWidth = positiveNumber(
      container.measured?.width ?? container.style?.width ?? container.width,
      fallbackContainerWidth,
    );
    const innerLeft = containerX + horizontalPadding;
    const availableWidth = Math.max(0, containerWidth - horizontalPadding * 2);
    const members = updated.filter(node => {
      const data = node.data as Record<string, unknown> | undefined;
      return domainKeyOf(node) === domainKey
        && !allowedContainerTypes.has(String(node.type ?? ''))
        && data?.hidden !== true;
    });
    if (members.length === 0) continue;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const member of members) {
      const memberX = finiteNumber(member.position?.x, innerLeft);
      const memberWidth = positiveNumber(
        member.measured?.width ?? member.style?.width ?? member.width,
        fallbackMemberWidth,
      );
      minX = Math.min(minX, memberX);
      maxX = Math.max(maxX, memberX + memberWidth);
    }
    const contentWidth = maxX - minX;
    if (!Number.isFinite(contentWidth) || contentWidth <= 0 || availableWidth <= contentWidth) {
      continue;
    }

    const deltaX = Math.round(
      innerLeft + (availableWidth - contentWidth) / 2 - minX,
    );
    if (deltaX === 0) continue;
    for (const member of members) translateNode(member, deltaX, 0);
  }

  return updated;
};

/**
 * Vertically restacks domain containers and rigidly translates every node
 * carrying the same non-empty domain key.
 */
export const stackDomainsVerticallyRigid = (
  nodes: readonly ReactFlowNode[],
  rawOptions: DomainVerticalStackOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const top = finiteNumber(rawOptions.top, 80);
  const gap = Math.max(0, finiteNumber(rawOptions.gap, 48));
  const fallbackHeight = positiveNumber(rawOptions.fallbackHeight, 100);
  const allowedContainerTypes = new Set(
    rawOptions.containerTypes
      ? [...rawOptions.containerTypes].filter(type => typeof type === 'string' && type.length > 0)
      : ['titleGroup'],
  );
  const orderIndex = new Map<string, number>();
  if (Array.isArray(rawOptions.domainOrder)) {
    for (const value of rawOptions.domainOrder) {
      if (typeof value !== 'string') continue;
      const key = value.trim();
      if (key && !orderIndex.has(key)) orderIndex.set(key, orderIndex.size);
    }
  }
  const originalIndex = new Map(updated.map((node, index) => [node.id, index] as const));
  const seenDomains = new Set<string>();
  const domains = updated
    .filter(node => {
      if (!allowedContainerTypes.has(String(node.type ?? ''))) return false;
      const data = node.data as Record<string, unknown> | undefined;
      if (rawOptions.includeHiddenDomains === false && data?.hidden === true) return false;
      const domainKey = domainKeyOf(node);
      if (!domainKey || seenDomains.has(domainKey)) return false;
      seenDomains.add(domainKey);
      return true;
    })
    .sort((left, right) => {
      const leftOrder = orderIndex.get(domainKeyOf(left));
      const rightOrder = orderIndex.get(domainKeyOf(right));
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.POSITIVE_INFINITY)
          - (rightOrder ?? Number.POSITIVE_INFINITY);
      }
      if (rawOptions.sortBy === 'position') {
        const positionDelta = finiteNumber(left.position?.y, 0)
          - finiteNumber(right.position?.y, 0);
        if (positionDelta !== 0) return positionDelta;
      }
      return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
    });

  let cursorY = rawOptions.anchor === 'first-current' && domains.length > 0
    ? finiteNumber(domains[0].position?.y, top)
    : top;
  for (const domain of domains) {
    const currentY = finiteNumber(domain.position?.y, 0);
    const targetY = rawOptions.mode === 'push-down'
      ? Math.max(currentY, cursorY)
      : cursorY;
    translateDomainInPlace(
      updated,
      domainKeyOf(domain),
      0,
      targetY - currentY,
    );
    if (rawOptions.markFinalizedDomains) {
      domain.data = {
        ...((domain.data as Record<string, unknown> | undefined) ?? {}),
        finalizedDomain: true,
      };
    }
    cursorY = targetY + nodeHeight(domain, fallbackHeight) + gap;
  }

  return updated;
};

export interface CompactSubGroupStackOptions {
  top: number;
  gap: number;
}

export interface HorizontalSubGroupSeparationOptions {
  domainHorizontalPadding: number;
  firstSubGroupOffset?: number;
  gap: number;
  fallbackSubGroupWidth: number;
  domainKeys?: readonly string[];
}

export interface HorizontalSubGroupSeparationResult {
  nodes: ReactFlowNode[];
  movedDomainKeys: string[];
}

/**
 * Pushes visible subgroups rightward within each title-group domain so their
 * horizontal projections are separated, moving declared children rigidly.
 */
export const separateVisibleSubGroupsHorizontally = (
  nodes: readonly ReactFlowNode[],
  rawOptions: HorizontalSubGroupSeparationOptions,
): HorizontalSubGroupSeparationResult => {
  const updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  const domainHorizontalPadding = Math.max(
    0,
    finiteNumber(rawOptions.domainHorizontalPadding, 0),
  );
  const firstSubGroupOffset = finiteNumber(rawOptions.firstSubGroupOffset, 0);
  const gap = Math.max(0, finiteNumber(rawOptions.gap, 0));
  const fallbackSubGroupWidth = positiveNumber(
    rawOptions.fallbackSubGroupWidth,
    240,
  );
  const movedDomainKeys: string[] = [];
  const seenDomains = new Set<string>();
  const selectedDomainKeys = Array.isArray(rawOptions.domainKeys)
    ? new Set(rawOptions.domainKeys
      .filter(key => typeof key === 'string')
      .map(key => key.trim())
      .filter(Boolean))
    : undefined;

  for (const domain of updated) {
    if (domain.type !== 'titleGroup') continue;
    const domainKey = domainKeyOf(domain);
    if (!domainKey || seenDomains.has(domainKey)) continue;
    if (selectedDomainKeys && !selectedDomainKeys.has(domainKey)) continue;
    seenDomains.add(domainKey);
    const subGroups = updated
      .filter(node =>
        node.type === 'subGroup'
        && domainKeyOf(node) === domainKey
        && (node.data as Record<string, unknown> | undefined)?.hidden !== true)
      .sort((left, right) =>
        finiteNumber(left.position?.x, 0) - finiteNumber(right.position?.x, 0));
    let nextLeft = finiteNumber(domain.position?.x, 0)
      + domainHorizontalPadding
      + firstSubGroupOffset;
    let moved = false;

    for (const subGroup of subGroups) {
      const currentX = finiteNumber(subGroup.position?.x, nextLeft);
      const targetX = Math.max(currentX, nextLeft);
      const deltaX = Math.round(targetX - currentX);
      if (deltaX > 0) {
        translateSubGroupRigidlyInPlace(nodeById, subGroup, deltaX, 0);
        moved = true;
      }
      nextLeft = targetX + nodeWidth(subGroup, fallbackSubGroupWidth) + gap;
    }
    if (moved) movedDomainKeys.push(domainKey);
  }

  return { nodes: updated, movedDomainKeys };
};

/**
 * Compacts visible subgroups when their domain containers are hidden and moves
 * each subgroup's declared children by the same vertical delta.
 */
export const compactVisibleSubGroupsRigid = (
  nodes: readonly ReactFlowNode[],
  rawOptions: CompactSubGroupStackOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  const subGroups = updated
    .filter(node =>
      node.type === 'subGroup'
      && !(node.data as Record<string, unknown> | undefined)?.hidden)
    .sort((left, right) =>
      finiteNumber(left.position?.y, 0) - finiteNumber(right.position?.y, 0));
  let cursorY = finiteNumber(rawOptions.top, 80);
  const gap = Math.max(0, finiteNumber(rawOptions.gap, 48));

  for (const subGroup of subGroups) {
    const oldY = finiteNumber(subGroup.position?.y, 0);
    const deltaY = cursorY - oldY;
    translateSubGroupRigidlyInPlace(nodeById, subGroup, 0, deltaY);
    cursorY += nodeHeight(subGroup, 100) + gap;
  }

  return updated;
};
