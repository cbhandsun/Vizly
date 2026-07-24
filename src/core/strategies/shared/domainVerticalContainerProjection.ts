import type { Node as ReactFlowNode } from '@xyflow/react';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegativeNumber = (value: unknown, fallback: number): number =>
  Math.max(0, finiteNumber(value, fallback));

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
  String((node.data as Record<string, unknown> | undefined)?.domain ?? '');

const isHidden = (node: ReactFlowNode): boolean =>
  (node.data as Record<string, unknown> | undefined)?.hidden === true;

const readWidth = (node: ReactFlowNode): number =>
  nonNegativeNumber(node.measured?.width ?? node.style?.width ?? node.width, 0);

const readHeight = (node: ReactFlowNode, fallback: number): number =>
  positiveNumber(
    node.measured?.height ?? node.style?.height ?? node.height,
    fallback,
  );

const writeSize = (
  node: ReactFlowNode,
  width: number,
  height: number,
): void => {
  const safeWidth = nonNegativeNumber(width, 0);
  const safeHeight = nonNegativeNumber(height, 0);
  node.style = { ...(node.style ?? {}), width: safeWidth, height: safeHeight };
  node.measured = { width: safeWidth, height: safeHeight };
  node.width = safeWidth;
  node.height = safeHeight;
};

export interface SingleDomainContainerProjectionOptions {
  containerId: string;
  domainKey: string;
  left: number;
  top: number;
  memberFallbackLeft: number;
  memberFallbackTop: number;
  horizontalPadding: number;
  sideSafeGap: number;
  widthCompensation: number;
  headerHeight: number;
  bottomSafeGap: number;
  extraVerticalPadding: number;
  domainGap: number;
  defaultMemberWidth: number;
  defaultMemberHeight: number;
}

export interface SingleDomainContainerProjectionResult {
  nodes: ReactFlowNode[];
  nextTop: number;
}

/**
 * Projects one visible domain container after its members have been laid out.
 * Hidden and foreign-domain members are excluded. Empty domains retain their
 * current width and collapse to their header height.
 */
export const projectSingleDomainContainer = (
  nodes: readonly ReactFlowNode[],
  rawOptions: SingleDomainContainerProjectionOptions,
): SingleDomainContainerProjectionResult => {
  const updated = cloneNodes(nodes);
  const top = finiteNumber(rawOptions.top, 0);
  const domainGap = nonNegativeNumber(rawOptions.domainGap, 0);
  const container = updated.find(node => node.id === rawOptions.containerId);
  if (!container) {
    return { nodes: updated, nextTop: top + domainGap };
  }

  const domainKey = String(rawOptions.domainKey ?? '').trim();
  const fallbackLeft = finiteNumber(rawOptions.memberFallbackLeft, 0);
  const fallbackTop = finiteNumber(rawOptions.memberFallbackTop, top);
  const horizontalPadding = nonNegativeNumber(rawOptions.horizontalPadding, 0);
  const sideSafeGap = nonNegativeNumber(rawOptions.sideSafeGap, 0);
  const widthCompensation = positiveNumber(rawOptions.widthCompensation, 1);
  const headerHeight = nonNegativeNumber(rawOptions.headerHeight, 0);
  const bottomSafeGap = nonNegativeNumber(rawOptions.bottomSafeGap, 0);
  const extraVerticalPadding = nonNegativeNumber(
    rawOptions.extraVerticalPadding,
    0,
  );
  const defaultMemberWidth = positiveNumber(rawOptions.defaultMemberWidth, 240);
  const defaultMemberHeight = positiveNumber(rawOptions.defaultMemberHeight, 80);
  let minimumLeft = Number.POSITIVE_INFINITY;
  let maximumRight = Number.NEGATIVE_INFINITY;
  let maximumBottom = Number.NEGATIVE_INFINITY;

  if (domainKey) {
    for (const member of updated) {
      if (
        member.type === 'titleGroup'
        || domainKeyOf(member).trim() !== domainKey
        || isHidden(member)
      ) {
        continue;
      }
      const memberLeft = finiteNumber(member.position?.x, fallbackLeft);
      const memberTop = finiteNumber(member.position?.y, fallbackTop);
      const memberWidth = positiveNumber(
        Math.max(
          finiteNumber(member.measured?.width, 0),
          finiteNumber(member.style?.width, 0),
          finiteNumber(member.width, 0),
        ),
        defaultMemberWidth,
      );
      const memberHeight = positiveNumber(
        member.measured?.height ?? member.style?.height ?? member.height,
        defaultMemberHeight,
      );
      minimumLeft = Math.min(minimumLeft, memberLeft);
      maximumRight = Math.max(maximumRight, memberLeft + memberWidth);
      maximumBottom = Math.max(maximumBottom, memberTop + memberHeight);
    }
  }

  const projectedWidth = Number.isFinite(maximumRight)
    ? Math.max(
      0,
      maximumRight - minimumLeft + horizontalPadding * 2 + sideSafeGap * 2,
    ) * widthCompensation
    : 0;
  const projectedHeight = Number.isFinite(maximumBottom)
    ? Math.max(
      headerHeight,
      maximumBottom - fallbackTop
        + headerHeight
        + bottomSafeGap
        + extraVerticalPadding,
    )
    : headerHeight;
  const finalWidth = Math.max(readWidth(container), projectedWidth);
  const roundedWidth = Math.round(finalWidth);
  const roundedHeight = Math.round(projectedHeight);

  container.position = {
    x: Math.round(finiteNumber(rawOptions.left, 0)),
    y: Math.round(top),
  };
  writeSize(container, roundedWidth, roundedHeight);

  return {
    nodes: updated,
    nextTop: top + projectedHeight + domainGap,
  };
};

export interface DeterministicDomainWidthProjectionOptions {
  containerTypes: ReadonlySet<string>;
  anchorLeft: number;
  horizontalPadding: number;
  subGroupGap: number;
  freeNodeGap: number;
  defaultMemberWidth: number;
  fallbackContainerHeight: number;
}

/**
 * Unifies domain widths using the largest of current width, visible member
 * projection, deterministic subgroup-row width, and deterministic free-node
 * row width.
 */
export const projectAndUnifyDeterministicDomainWidths = (
  nodes: readonly ReactFlowNode[],
  rawOptions: DeterministicDomainWidthProjectionOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const containers = updated.filter(node =>
    rawOptions.containerTypes.has(String(node.type ?? '')));
  if (!containers.length) return updated;

  const anchorLeft = finiteNumber(rawOptions.anchorLeft, 0);
  const horizontalPadding = nonNegativeNumber(rawOptions.horizontalPadding, 0);
  const subGroupGap = nonNegativeNumber(rawOptions.subGroupGap, 0);
  const freeNodeGap = nonNegativeNumber(rawOptions.freeNodeGap, 0);
  const defaultMemberWidth = positiveNumber(rawOptions.defaultMemberWidth, 240);
  const fallbackContainerHeight = positiveNumber(
    rawOptions.fallbackContainerHeight,
    80,
  );
  const safeEdgeWidth = Math.max(4, Math.floor(horizontalPadding * 0.25));
  const freeSafeEdgeWidth = Math.max(16, Math.floor(freeNodeGap * 0.65));
  const requiredWidths: number[] = [];

  for (const container of containers) {
    const domainKey = domainKeyOf(container).trim();
    const left = finiteNumber(container.position?.x, anchorLeft);
    let maximumRight = Number.NEGATIVE_INFINITY;
    const subGroups: ReactFlowNode[] = [];
    const freeNodes: ReactFlowNode[] = [];

    if (domainKey) {
      for (const member of updated) {
        if (
          rawOptions.containerTypes.has(String(member.type ?? ''))
          || domainKeyOf(member).trim() !== domainKey
          || isHidden(member)
        ) {
          continue;
        }
        const memberWidth = positiveNumber(
          member.measured?.width ?? member.style?.width ?? member.width,
          defaultMemberWidth,
        );
        maximumRight = Math.max(
          maximumRight,
          finiteNumber(member.position?.x, left) + memberWidth,
        );
        if (member.type === 'subGroup') subGroups.push(member);
        else freeNodes.push(member);
      }
    }

    const projectedWidth = Number.isFinite(maximumRight)
      ? Math.max(0, maximumRight - left)
        + horizontalPadding * 2
        + safeEdgeWidth
      : 0;
    const subGroupWidth = subGroups.length
      ? subGroups.reduce((sum, subGroup) => sum + readWidth(subGroup), 0)
        + Math.max(0, subGroups.length - 1) * Math.max(12, subGroupGap)
        + horizontalPadding * 2
        + safeEdgeWidth
      : 0;
    const freeNodeWidth = freeNodes.length
      ? freeNodes.reduce((sum, freeNode) =>
        sum + positiveNumber(
          freeNode.measured?.width ?? freeNode.style?.width ?? freeNode.width,
          defaultMemberWidth,
        ), 0)
        + Math.max(0, freeNodes.length - 1)
          * Math.min(freeNodeGap, Math.max(subGroupGap, freeNodeGap))
        + horizontalPadding * 2
        + freeSafeEdgeWidth
      : 0;
    requiredWidths.push(
      Math.max(
        readWidth(container),
        projectedWidth,
        subGroupWidth,
        freeNodeWidth,
      ),
    );
  }

  const unifiedWidth = Math.max(...requiredWidths);
  if (!(unifiedWidth > 0) || !Number.isFinite(unifiedWidth)) return updated;
  for (const container of containers) {
    writeSize(
      container,
      unifiedWidth,
      readHeight(container, fallbackContainerHeight),
    );
  }
  return updated;
};

/**
 * Equalizes visible subgroup heights inside domains that have a title-group
 * container. Anchors and widths are preserved; domains with fewer than two
 * visible subgroups are left unchanged.
 */
export const equalizeVisibleSubGroupHeightsByDomain = (
  nodes: readonly ReactFlowNode[],
  fallbackHeight: number,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const safeFallbackHeight = positiveNumber(fallbackHeight, 80);
  const domainKeys = new Set(
    updated
      .filter(node => node.type === 'titleGroup')
      .map(domainKeyOf)
      .filter(Boolean),
  );

  for (const domainKey of domainKeys) {
    const subGroups = updated.filter(node =>
      node.type === 'subGroup'
      && domainKeyOf(node) === domainKey
      && !isHidden(node));
    if (subGroups.length < 2) continue;
    const maximumHeight = Math.max(...subGroups.map(node =>
      positiveNumber(
        node.measured?.height ?? node.style?.height ?? node.height,
        safeFallbackHeight,
      )));
    for (const subGroup of subGroups) {
      writeSize(subGroup, readWidth(subGroup), maximumHeight);
    }
  }

  return updated;
};

export interface DomainHeightProjectionOptions {
  titleHeight: number;
  titleVerticalPadding: number;
  titleSafeGap: number;
  bottomSafeGap: number;
  defaultMemberHeight: number;
  containerTypes?: readonly string[] | ReadonlySet<string>;
  left?: number;
  extraVerticalPadding?: number;
}

/**
 * Recomputes title-group heights from the maximum lower edge of visible domain
 * members while preserving each domain's position and width.
 */
export const projectDomainHeightsFromVisibleMembers = (
  nodes: readonly ReactFlowNode[],
  rawOptions: DomainHeightProjectionOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const titleHeight = nonNegativeNumber(rawOptions.titleHeight, 0);
  const titleVerticalPadding = nonNegativeNumber(
    rawOptions.titleVerticalPadding,
    0,
  );
  const titleSafeGap = nonNegativeNumber(rawOptions.titleSafeGap, 0);
  const bottomSafeGap = nonNegativeNumber(rawOptions.bottomSafeGap, 0);
  const defaultMemberHeight = positiveNumber(rawOptions.defaultMemberHeight, 80);
  const extraVerticalPadding = nonNegativeNumber(rawOptions.extraVerticalPadding, 0);
  const headerHeight = titleHeight + titleVerticalPadding + titleSafeGap;
  const containerTypes = new Set(
    rawOptions.containerTypes
      ? [...rawOptions.containerTypes].filter(type => typeof type === 'string' && type.length > 0)
      : ['titleGroup'],
  );
  const seenDomains = new Set<string>();

  for (const domain of updated.filter(node =>
    containerTypes.has(String(node.type ?? '')))) {
    const domainKey = domainKeyOf(domain).trim();
    if (!domainKey || seenDomains.has(domainKey)) continue;
    seenDomains.add(domainKey);
    const domainTop = finiteNumber(domain.position?.y, 0);
    const innerTop = domainTop + headerHeight;
    let maximumBottom = innerTop;

    for (const member of updated) {
      if (
        containerTypes.has(String(member.type ?? ''))
        || domainKeyOf(member).trim() !== domainKey
        || isHidden(member)
      ) {
        continue;
      }
      const memberTop = finiteNumber(member.position?.y, innerTop);
      const memberHeight = positiveNumber(
        member.measured?.height ?? member.style?.height ?? member.height,
        defaultMemberHeight,
      );
      maximumBottom = Math.max(maximumBottom, memberTop + memberHeight);
    }

    const contentHeight = Math.max(0, maximumBottom - innerTop);
    if (rawOptions.left !== undefined) {
      domain.position = {
        x: Math.round(finiteNumber(rawOptions.left, 0)),
        y: domainTop,
      };
    }
    writeSize(
      domain,
      readWidth(domain),
      headerHeight + contentHeight + bottomSafeGap + extraVerticalPadding,
    );
  }

  return updated;
};

export interface DomainBoundsProjectionOptions {
  containerTypes: readonly string[] | ReadonlySet<string>;
  horizontalPadding: number;
  titleHeight: number;
  titleVerticalPadding: number;
  titleSafeGap: number;
  bottomSafeGap: number;
  defaultMemberWidth: number;
  defaultMemberHeight: number;
  fallbackContainerHeight: number;
  ignoreHiddenMembers?: boolean;
}

/**
 * Projects each domain's visible member bounds, applies its projected height,
 * and unifies all selected domain containers to the largest projected width.
 */
export const projectAndUnifyDomainContainerBounds = (
  nodes: readonly ReactFlowNode[],
  rawOptions: DomainBoundsProjectionOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const containerTypes = new Set(
    [...rawOptions.containerTypes].filter(type =>
      typeof type === 'string' && type.length > 0),
  );
  const horizontalPadding = nonNegativeNumber(rawOptions.horizontalPadding, 0);
  const headerHeight = nonNegativeNumber(rawOptions.titleHeight, 0)
    + nonNegativeNumber(rawOptions.titleVerticalPadding, 0)
    + nonNegativeNumber(rawOptions.titleSafeGap, 0);
  const bottomSafeGap = nonNegativeNumber(rawOptions.bottomSafeGap, 0);
  const defaultMemberWidth = positiveNumber(rawOptions.defaultMemberWidth, 240);
  const defaultMemberHeight = positiveNumber(rawOptions.defaultMemberHeight, 80);
  const fallbackContainerHeight = positiveNumber(
    rawOptions.fallbackContainerHeight,
    headerHeight + bottomSafeGap || 80,
  );
  const requiredByDomain = new Map<string, { width: number; height: number }>();

  for (const container of updated) {
    if (!containerTypes.has(String(container.type ?? ''))) continue;
    const domainKey = domainKeyOf(container).trim();
    if (!domainKey || requiredByDomain.has(domainKey)) continue;
    const containerX = finiteNumber(container.position?.x, 0);
    const containerY = finiteNumber(container.position?.y, 0);
    const innerLeft = containerX + horizontalPadding;
    const innerTop = containerY + headerHeight;
    let maximumRight = Number.NEGATIVE_INFINITY;
    let maximumBottom = Number.NEGATIVE_INFINITY;

    for (const member of updated) {
      if (
        containerTypes.has(String(member.type ?? ''))
        || domainKeyOf(member).trim() !== domainKey
        || (rawOptions.ignoreHiddenMembers && isHidden(member))
      ) {
        continue;
      }
      maximumRight = Math.max(
        maximumRight,
        finiteNumber(member.position?.x, innerLeft)
          + positiveNumber(
            member.measured?.width ?? member.style?.width ?? member.width,
            defaultMemberWidth,
          ),
      );
      maximumBottom = Math.max(
        maximumBottom,
        finiteNumber(member.position?.y, innerTop)
          + positiveNumber(
            member.measured?.height ?? member.style?.height ?? member.height,
            defaultMemberHeight,
          ),
      );
    }

    requiredByDomain.set(domainKey, {
      width: Math.ceil(Number.isFinite(maximumRight)
        ? Math.max(0, maximumRight - innerLeft) + horizontalPadding * 2
        : readWidth(container)),
      height: Math.ceil(
        headerHeight
        + (Number.isFinite(maximumBottom)
          ? Math.max(0, maximumBottom - innerTop)
          : 0)
        + bottomSafeGap,
      ),
    });
  }

  const unifiedWidth = requiredByDomain.size
    ? Math.max(...[...requiredByDomain.values()].map(value => value.width))
    : 0;
  if (!(unifiedWidth > 0)) return updated;
  for (const container of updated) {
    if (!containerTypes.has(String(container.type ?? ''))) continue;
    const required = requiredByDomain.get(domainKeyOf(container).trim());
    writeSize(
      container,
      unifiedWidth,
      required?.height ?? readHeight(container, fallbackContainerHeight),
    );
  }
  return updated;
};

export interface SemanticDomainWidthProjectionOptions {
  containerTypes: ReadonlySet<string>;
  horizontalPadding: number;
  extraRightPadding: number;
  defaultMemberWidth: number;
  fallbackContainerHeight: number;
  preserveCurrentWidth?: boolean;
  ignoreHiddenMembers?: boolean;
}

/**
 * Projects semantic domain-member right edges and applies the largest required
 * width to every selected domain-container type.
 */
export const projectAndUnifySemanticDomainWidths = (
  nodes: readonly ReactFlowNode[],
  rawOptions: SemanticDomainWidthProjectionOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const horizontalPadding = nonNegativeNumber(rawOptions.horizontalPadding, 0);
  const extraRightPadding = nonNegativeNumber(rawOptions.extraRightPadding, 0);
  const defaultMemberWidth = positiveNumber(rawOptions.defaultMemberWidth, 240);
  const fallbackContainerHeight = positiveNumber(
    rawOptions.fallbackContainerHeight,
    80,
  );
  const requiredWidths: number[] = [];

  for (const container of updated.filter(node =>
    rawOptions.containerTypes.has(String(node.type ?? '')))) {
    const domainKey = domainKeyOf(container).trim();
    if (!domainKey) continue;
    const containerX = finiteNumber(container.position?.x, 0);
    let maximumRight = Number.NEGATIVE_INFINITY;
    for (const member of updated) {
      if (
        member.type === 'titleGroup'
        || domainKeyOf(member).trim() !== domainKey
        || (rawOptions.ignoreHiddenMembers && isHidden(member))
      ) {
        continue;
      }
      maximumRight = Math.max(
        maximumRight,
        finiteNumber(member.position?.x, 0)
          + positiveNumber(
            member.measured?.width ?? member.style?.width ?? member.width,
            defaultMemberWidth,
          ),
      );
    }
    const currentWidth = readWidth(container);
    const projectedWidth = Number.isFinite(maximumRight)
      ? Math.max(0, maximumRight - containerX)
        + horizontalPadding * 2
        + extraRightPadding
      : currentWidth;
    requiredWidths.push(
      rawOptions.preserveCurrentWidth
        ? Math.max(currentWidth, projectedWidth)
        : projectedWidth,
    );
  }

  const unifiedWidth = requiredWidths.length
    ? Math.max(...requiredWidths)
    : 0;
  if (!(unifiedWidth > 0)) return updated;
  for (const container of updated) {
    if (!rawOptions.containerTypes.has(String(container.type ?? ''))) continue;
    writeSize(
      container,
      unifiedWidth,
      readHeight(container, fallbackContainerHeight),
    );
  }
  return updated;
};

/**
 * Equalizes selected container widths to their current maximum without moving
 * containers or their members.
 */
export const unifyContainerWidthsByMaximum = (
  nodes: readonly ReactFlowNode[],
  containerTypes: ReadonlySet<string>,
  fallbackHeight: number,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const containers = updated.filter(node =>
    containerTypes.has(String(node.type ?? '')));
  const maximumWidth = containers.length
    ? Math.max(...containers.map(readWidth))
    : 0;
  if (!(maximumWidth > 0)) return updated;
  for (const container of containers) {
    writeSize(
      container,
      maximumWidth,
      readHeight(container, fallbackHeight),
    );
  }
  return updated;
};

export interface VerticalBandWidthExpansionOptions {
  horizontalPadding: number;
  leftTolerance?: number;
  fallbackContainerHeight?: number;
}

/**
 * Expands title-group widths from visible nodes whose vertical centers fall
 * inside the container's current vertical band.
 */
export const expandDomainWidthsFromVisibleVerticalBands = (
  nodes: readonly ReactFlowNode[],
  rawOptions: VerticalBandWidthExpansionOptions,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const horizontalPadding = nonNegativeNumber(rawOptions.horizontalPadding, 0);
  const leftTolerance = nonNegativeNumber(rawOptions.leftTolerance, 10);
  const fallbackContainerHeight = positiveNumber(
    rawOptions.fallbackContainerHeight,
    80,
  );

  for (const domain of updated.filter(node => node.type === 'titleGroup')) {
    const domainX = finiteNumber(domain.position?.x, 0);
    const domainY = finiteNumber(domain.position?.y, 0);
    const domainHeight = readHeight(domain, fallbackContainerHeight);
    const domainBottom = domainY + domainHeight;
    let maximumRight = Number.NEGATIVE_INFINITY;

    for (const member of updated) {
      if (member.type === 'titleGroup' || isHidden(member)) continue;
      const memberX = finiteNumber(member.position?.x, 0);
      const memberY = finiteNumber(member.position?.y, 0);
      const memberWidth = readWidth(member);
      const memberHeight = nonNegativeNumber(
        member.measured?.height ?? member.style?.height ?? member.height,
        0,
      );
      const memberCenterY = memberY + memberHeight / 2;
      if (
        memberCenterY >= domainY
        && memberCenterY <= domainBottom
        && memberX >= domainX - leftTolerance
      ) {
        maximumRight = Math.max(maximumRight, memberX + memberWidth);
      }
    }

    if (!Number.isFinite(maximumRight)) continue;
    const requiredWidth = Math.max(0, maximumRight - domainX)
      + horizontalPadding;
    const currentWidth = readWidth(domain);
    writeSize(domain, Math.max(currentWidth, requiredWidth), domainHeight);
  }

  return updated;
};
