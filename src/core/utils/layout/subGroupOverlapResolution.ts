import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

export interface SubGroupOverlapResolutionOptions {
  recomputeContainers: (nodes: ReactFlowNode[]) => ReactFlowNode[];
  enforceDomainContainment: (nodes: ReactFlowNode[]) => ReactFlowNode[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

const spacing = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 0, 10_000)
);

const cloneNode = (node: ReactFlowNode): ReactFlowNode => ({
  ...node,
  position: {
    x: boundedNumber(node.position?.x, 0),
    y: boundedNumber(node.position?.y, 0),
  },
  data: node.data ? { ...node.data } : {},
  style: node.style ? { ...node.style } : node.style,
  measured: node.measured
    ? {
      width: spacing(node.measured.width, 0),
      height: spacing(node.measured.height, 0),
    }
    : node.measured,
});

const nodeRect = (node: ReactFlowNode): Rect => ({
  x: boundedNumber(node.position?.x, 0),
  y: boundedNumber(node.position?.y, 0),
  width: spacing(node.measured?.width ?? node.style?.width ?? node.width, 0),
  height: spacing(node.measured?.height ?? node.style?.height ?? node.height, 0),
});

const overlapsHorizontally = (a: Rect, b: Rect): boolean => (
  a.x < b.x + b.width && a.x + a.width > b.x
);

const overlapsVertically = (a: Rect, b: Rect): boolean => (
  a.y < b.y + b.height && a.y + a.height > b.y
);

const intersects = (a: Rect, b: Rect): boolean => (
  overlapsHorizontally(a, b) && overlapsVertically(a, b)
);

const domainKey = (node: ReactFlowNode): string => (
  String(asRecord(node.data).domain || '').trim()
);

const isVisibleSubGroup = (node: ReactFlowNode): boolean => (
  String(node.type || '') === 'subGroup' && !asRecord(node.data).hidden
);

export const resolveSubGroupOverlapsWithConfig = (
  nodeInputs: ReactFlowNode[],
  horizontalGapOverride: unknown,
  verticalGapOverride: unknown,
  layoutConfig: unknown,
  config: unknown,
  options: SubGroupOverlapResolutionOptions,
): ReactFlowNode[] => {
  const horizontalGap = spacing(
    horizontalGapOverride,
    spacing(nestedValue(layoutConfig, 'NODE_H_GAP'), 120),
  );
  const verticalGap = spacing(
    verticalGapOverride,
    spacing(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
  );
  let updated = nodeInputs.map(cloneNode);
  const indexById = new Map(updated.map((node, index) => [node.id, index]));

  const currentNode = (id: string): ReactFlowNode | undefined => {
    const index = indexById.get(id);
    return index === undefined ? undefined : updated[index];
  };

  const translateSubGroup = (subGroupId: string, dxInput: number, dyInput: number) => {
    const subGroup = currentNode(subGroupId);
    if (!subGroup) return;
    const dx = boundedNumber(dxInput, 0);
    const dy = boundedNumber(dyInput, 0);
    subGroup.position = {
      x: boundedNumber(subGroup.position.x + dx, 0),
      y: boundedNumber(subGroup.position.y + dy, 0),
    };
    const dataPosition = asRecord(asRecord(subGroup.data).position);
    if (Object.keys(dataPosition).length) {
      subGroup.data = {
        ...subGroup.data,
        position: {
          x: boundedNumber(dataPosition.x, 0) + dx,
          y: boundedNumber(dataPosition.y, 0) + dy,
        },
      };
    }
    const children = asRecord(subGroup.data).children;
    if (!Array.isArray(children)) return;
    for (const childId of children) {
      if (typeof childId !== 'string') continue;
      const child = currentNode(childId);
      if (!child) continue;
      child.position = {
        x: boundedNumber(child.position.x + dx, 0),
        y: boundedNumber(child.position.y + dy, 0),
      };
    }
  };

  const subGroupIds = updated
    .filter(node => String(node.type || '') === 'subGroup')
    .map(node => node.id);
  if (subGroupIds.length <= 1) return updated;

  const visibleIds = subGroupIds.filter(id => {
    const node = currentNode(id);
    return node ? isVisibleSubGroup(node) : false;
  });
  const globalByY = visibleIds.slice().sort((aId, bId) => (
    nodeRect(currentNode(aId) as ReactFlowNode).y
    - nodeRect(currentNode(bId) as ReactFlowNode).y
  ));
  const globallyPlaced: Rect[] = [];
  for (const id of globalByY) {
    const node = currentNode(id);
    if (!node) continue;
    const rect = nodeRect(node);
    let shiftY = 0;
    for (const placed of globallyPlaced) {
      if (!overlapsHorizontally(rect, placed)) continue;
      shiftY = Math.max(
        shiftY,
        placed.y + placed.height + verticalGap - rect.y,
      );
    }
    if (shiftY > 0) translateSubGroup(id, 0, shiftY);
    globallyPlaced.push({ ...rect, y: rect.y + Math.max(0, shiftY) });
  }

  const idsByDomain = new Map<string, string[]>();
  for (const id of subGroupIds) {
    const node = currentNode(id);
    if (!node) continue;
    const key = domainKey(node);
    if (!key) continue;
    idsByDomain.set(key, [...(idsByDomain.get(key) || []), id]);
  }

  for (const [key, domainSubGroupIds] of idsByDomain) {
    if (domainSubGroupIds.length <= 1) continue;
    const byY = domainSubGroupIds.slice().sort((aId, bId) => (
      nodeRect(currentNode(aId) as ReactFlowNode).y
      - nodeRect(currentNode(bId) as ReactFlowNode).y
    ));
    const verticallyPlaced: Rect[] = [];
    for (const id of byY) {
      const node = currentNode(id);
      if (!node) continue;
      const rect = nodeRect(node);
      let shiftY = 0;
      for (const placed of verticallyPlaced) {
        if (!overlapsHorizontally(rect, placed)) continue;
        shiftY = Math.max(
          shiftY,
          placed.y + placed.height + verticalGap - rect.y,
        );
      }
      if (shiftY > 0) translateSubGroup(id, 0, shiftY);
      verticallyPlaced.push({ ...rect, y: rect.y + Math.max(0, shiftY) });
    }

    const byX = domainSubGroupIds.slice().sort((aId, bId) => (
      nodeRect(currentNode(aId) as ReactFlowNode).x
      - nodeRect(currentNode(bId) as ReactFlowNode).x
    ));
    const horizontallyPlaced: Rect[] = [];
    for (const id of byX) {
      const node = currentNode(id);
      if (!node) continue;
      const rect = nodeRect(node);
      let shiftX = 0;
      for (const placed of horizontallyPlaced) {
        if (!overlapsVertically(rect, placed)) continue;
        shiftX = Math.max(
          shiftX,
          placed.x + placed.width + horizontalGap - rect.x,
        );
      }
      if (shiftX > 0) translateSubGroup(id, shiftX, 0);
      horizontallyPlaced.push({ ...rect, x: rect.x + Math.max(0, shiftX) });
    }

    for (let iteration = 0; iteration < 4; iteration += 1) {
      let collision = false;
      for (let left = 0; left < domainSubGroupIds.length; left += 1) {
        for (let right = left + 1; right < domainSubGroupIds.length; right += 1) {
          const first = currentNode(domainSubGroupIds[left]);
          const second = currentNode(domainSubGroupIds[right]);
          if (!first || !second || !intersects(nodeRect(first), nodeRect(second))) continue;
          collision = true;
          translateSubGroup(
            second.id,
            Math.ceil(horizontalGap * 0.25),
            Math.ceil(verticalGap * 0.15),
          );
        }
      }
      if (!collision) break;
    }

    const titleGroup = updated.find(node => (
      String(node.type || '') === 'titleGroup' && domainKey(node) === key
    ));
    if (!titleGroup) continue;
    const domainPadding = spacing(
      nestedValue(config, 'domain', 'padding', 'horizontal'),
      24,
    );
    const titleHeight = spacing(
      nestedValue(config, 'domain', 'title', 'height'),
      40,
    );
    const titlePadding = spacing(
      nestedValue(config, 'domain', 'title', 'padding', 'vertical'),
      12,
    );
    const titleSafeGap = spacing(
      nestedValue(config, 'domain', 'title', 'safeGap'),
      16,
    );
    const subGroupPadding = spacing(
      nestedValue(config, 'subDomain', 'padding', 'horizontal')
        ?? nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
      Math.max(16, Math.floor(domainPadding * 0.8)),
    );
    const subGroupTitleHeight = spacing(
      nestedValue(config, 'subDomain', 'title', 'height'),
      28,
    );
    const subGroupTitlePadding = spacing(
      nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
      8,
    );
    const subGroupTopPadding = spacing(
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_TOP')
        ?? nestedValue(config, 'subDomain', 'padding', 'top')
        ?? nestedValue(config, 'subDomain', 'padding', 'vertical'),
      Math.max(12, Math.floor(domainPadding * 0.8)),
    );
    const left = titleGroup.position.x + domainPadding;
    const rowTop = (
      titleGroup.position.y
      + titleHeight
      + titlePadding
      + titleSafeGap
      - subGroupTitleHeight
      - subGroupTitlePadding
      - subGroupTopPadding
    );
    const rowIds = domainSubGroupIds.slice().sort((aId, bId) => {
      const a = nodeRect(currentNode(aId) as ReactFlowNode);
      const b = nodeRect(currentNode(bId) as ReactFlowNode);
      return (b.width - a.width) || (a.y - b.y) || (a.x - b.x);
    });
    let cursorX = left - subGroupPadding;
    for (const id of rowIds) {
      const node = currentNode(id);
      if (!node) continue;
      const rect = nodeRect(node);
      translateSubGroup(id, Math.round(cursorX - rect.x), Math.round(rowTop - rect.y));
      cursorX += rect.width + horizontalGap;
    }
    updated = options.recomputeContainers(updated).map(cloneNode);
    updated = options.enforceDomainContainment(updated).map(cloneNode);
    indexById.clear();
    updated.forEach((node, index) => indexById.set(node.id, index));
  }

  return updated;
};
