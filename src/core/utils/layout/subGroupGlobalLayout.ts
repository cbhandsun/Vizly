import type { Node as ReactFlowNode } from '@xyflow/react';

import { diagramConfigManager } from '../../config/DiagramConfig';

type UnknownRecord = Record<string, unknown>;

interface NodeRectangle {
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

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const nodeRectangle = (
  node: ReactFlowNode,
  fallbackWidth = 0,
  fallbackHeight = 0,
): NodeRectangle => {
  const record = node as unknown as UnknownRecord;
  return {
    x: finiteNumber(node.position?.x, 0),
    y: finiteNumber(node.position?.y, 0),
    width: finiteNumber(
      node.measured?.width ?? node.style?.width ?? record.width,
      fallbackWidth,
    ),
    height: finiteNumber(
      node.measured?.height ?? node.style?.height ?? record.height,
      fallbackHeight,
    ),
  };
};

const excludedNodeTypes = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
const isVisibleBusinessNode = (node: ReactFlowNode): boolean => (
  !excludedNodeTypes.has(String(node.type || ''))
  && !asRecord(node.data).hidden
);

const cloneNodes = (nodes: ReactFlowNode[]): ReactFlowNode[] => nodes.map((node) => ({
  ...node,
  position: {
    x: finiteNumber(node.position?.x, 0),
    y: finiteNumber(node.position?.y, 0),
  },
}));

const projectionsOverlap = (
  firstStart: number,
  firstSize: number,
  secondStart: number,
  secondSize: number,
): boolean => !(
  firstStart + firstSize <= secondStart
  || secondStart + secondSize <= firstStart
);

export const resolveAllNodeOverlapsGlobal = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number,
): ReactFlowNode[] => {
  const layoutConfig = diagramConfigManager.getLayoutConfig();
  const verticalGap = finiteNumber(
    gapVOverride,
    finiteNumber(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
  );
  const horizontalGap = finiteNumber(
    gapHOverride,
    finiteNumber(nestedValue(layoutConfig, 'NODE_H_GAP'), 120),
  );
  const updated = cloneNodes(nodes);
  const visible = updated.filter(isVisibleBusinessNode);
  if (visible.length <= 1) return updated;

  const byY = [...visible].sort(
    (first, second) => nodeRectangle(first).y - nodeRectangle(second).y,
  );
  const verticallyPlaced: NodeRectangle[] = [];
  for (const node of byY) {
    const rectangle = nodeRectangle(node);
    let shiftY = 0;
    for (const placed of verticallyPlaced) {
      if (!projectionsOverlap(
        rectangle.x,
        rectangle.width,
        placed.x,
        placed.width,
      )) continue;
      shiftY = Math.max(
        shiftY,
        placed.y + placed.height + verticalGap - rectangle.y,
      );
    }
    if (shiftY > 0) {
      node.position = { x: rectangle.x, y: rectangle.y + shiftY };
    }
    verticallyPlaced.push({ ...rectangle, y: rectangle.y + Math.max(0, shiftY) });
  }

  const byX = [...visible].sort(
    (first, second) => nodeRectangle(first).x - nodeRectangle(second).x,
  );
  const horizontallyPlaced: NodeRectangle[] = [];
  for (const node of byX) {
    const rectangle = nodeRectangle(node);
    let shiftX = 0;
    for (const placed of horizontallyPlaced) {
      if (!projectionsOverlap(
        rectangle.y,
        rectangle.height,
        placed.y,
        placed.height,
      )) continue;
      shiftX = Math.max(
        shiftX,
        placed.x + placed.width + horizontalGap - rectangle.x,
      );
    }
    if (shiftX > 0) {
      node.position = { x: rectangle.x + shiftX, y: rectangle.y };
    }
    horizontallyPlaced.push({ ...rectangle, x: rectangle.x + Math.max(0, shiftX) });
  }
  return updated;
};

export const layoutNodesByGhostDomainColumns = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => {
  const config = diagramConfigManager.getConfig();
  const layoutConfig = diagramConfigManager.getLayoutConfig();
  const verticalGap = finiteNumber(nestedValue(layoutConfig, 'NODE_V_GAP'), 80);
  const columnPadding = Math.max(
    12,
    finiteNumber(nestedValue(config, 'domain', 'padding', 'horizontal'), 24),
  );
  const columnGap = Math.max(
    24,
    finiteNumber(nestedValue(config, 'domain', 'gap'), 40),
  );
  const left = Math.max(
    40,
    finiteNumber(nestedValue(config, 'diagram', 'padding', 'left'), 40),
  );
  const top = Math.max(
    40,
    finiteNumber(nestedValue(config, 'diagram', 'padding', 'top'), 40),
  );
  const fallbackWidth = finiteNumber(
    nestedValue(layoutConfig, 'NODE_MIN_WIDTH'),
    120,
  );
  const fallbackHeight = finiteNumber(nestedValue(config, 'node', 'height'), 80);
  const updated = cloneNodes(nodes);
  const visible = updated.filter(isVisibleBusinessNode);
  if (visible.length <= 1) return updated;

  const groups = new Map<string, ReactFlowNode[]>();
  for (const node of visible) {
    const domain = String(asRecord(node.data).domain || '').trim();
    const group = groups.get(domain) ?? [];
    group.push(node);
    groups.set(domain, group);
  }
  if (groups.size <= 1) return updated;

  const averageX = (group: ReactFlowNode[]): number => group.reduce(
    (sum, node) => sum + nodeRectangle(node).x,
    0,
  ) / Math.max(1, group.length);
  const orderedGroups = [...groups.entries()].sort(
    ([, first], [, second]) => averageX(first) - averageX(second),
  );
  let columnX = left;
  for (const [, group] of orderedGroups) {
    group.sort((first, second) => nodeRectangle(first).y - nodeRectangle(second).y);
    const maximumWidth = Math.max(...group.map(
      (node) => nodeRectangle(node, fallbackWidth, fallbackHeight).width,
    ));
    const columnWidth = Math.max(1, maximumWidth + columnPadding * 2);
    const centerX = columnX + Math.floor(columnWidth / 2);
    let nodeY = top;
    for (const node of group) {
      const rectangle = nodeRectangle(node, fallbackWidth, fallbackHeight);
      node.position = {
        x: Math.round(centerX - Math.floor(rectangle.width / 2)),
        y: Math.round(nodeY),
      };
      nodeY += rectangle.height + Math.max(8, verticalGap);
    }
    columnX += columnWidth + columnGap;
  }
  return updated;
};

const countOverlaps = (nodes: ReactFlowNode[]): number => {
  let overlaps = 0;
  for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
    const first = nodeRectangle(nodes[firstIndex]);
    for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
      const second = nodeRectangle(nodes[secondIndex]);
      if (
        projectionsOverlap(first.x, first.width, second.x, second.width)
        && projectionsOverlap(first.y, first.height, second.y, second.height)
      ) overlaps += 1;
    }
  }
  return overlaps;
};

export const enforceGlobalNoOverlapStrict = (
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number,
  maxIterations = 12,
): ReactFlowNode[] => {
  const updated = cloneNodes(nodes);
  const visible = updated.filter(isVisibleBusinessNode);
  if (visible.length <= 1) return updated;
  const horizontalGap = Math.max(12, finiteNumber(hGap, 12));
  const verticalGap = Math.max(8, finiteNumber(vGap, 8));
  const iterationLimit = Math.min(
    100,
    Math.max(1, Math.floor(finiteNumber(maxIterations, 12))),
  );

  for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
    const byY = [...visible].sort(
      (first, second) => nodeRectangle(first).y - nodeRectangle(second).y,
    );
    const verticallyPlaced: NodeRectangle[] = [];
    for (const node of byY) {
      const rectangle = nodeRectangle(node);
      let shiftY = 0;
      for (const placed of verticallyPlaced) {
        if (!projectionsOverlap(
          rectangle.x,
          rectangle.width,
          placed.x,
          placed.width,
        )) continue;
        shiftY = Math.max(
          shiftY,
          placed.y + placed.height + verticalGap - rectangle.y,
        );
      }
      if (shiftY > 0) {
        node.position = {
          x: Math.round(rectangle.x),
          y: Math.round(rectangle.y + shiftY),
        };
      }
      verticallyPlaced.push({ ...rectangle, y: rectangle.y + Math.max(0, shiftY) });
    }

    const byX = [...visible].sort(
      (first, second) => nodeRectangle(first).x - nodeRectangle(second).x,
    );
    const horizontallyPlaced: NodeRectangle[] = [];
    for (const node of byX) {
      const rectangle = nodeRectangle(node);
      let shiftX = 0;
      for (const placed of horizontallyPlaced) {
        if (!projectionsOverlap(
          rectangle.y,
          rectangle.height,
          placed.y,
          placed.height,
        )) continue;
        shiftX = Math.max(
          shiftX,
          placed.x + placed.width + horizontalGap - rectangle.x,
        );
      }
      if (shiftX > 0) {
        node.position = {
          x: Math.round(rectangle.x + shiftX),
          y: Math.round(rectangle.y),
        };
      }
      horizontallyPlaced.push({ ...rectangle, x: rectangle.x + Math.max(0, shiftX) });
    }
    if (countOverlaps(visible) === 0) break;
  }
  return updated;
};

export const resolveFreeNodeOverlapsInDomain = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number,
): ReactFlowNode[] => {
  const layoutConfig = diagramConfigManager.getLayoutConfig();
  const verticalGap = finiteNumber(
    gapVOverride,
    finiteNumber(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
  );
  const horizontalGap = finiteNumber(
    gapHOverride,
    finiteNumber(nestedValue(layoutConfig, 'NODE_H_GAP'), 120),
  );
  const updated = cloneNodes(nodes);
  const domains = new Set(
    updated
      .map((node) => String(asRecord(node.data).domain || '').trim())
      .filter(Boolean),
  );

  for (const domain of domains) {
    const childIds = new Set<string>();
    for (const subGroup of updated) {
      const data = asRecord(subGroup.data);
      if (subGroup.type !== 'subGroup' || String(data.domain || '') !== domain) {
        continue;
      }
      const children = Array.isArray(data.children) ? data.children : [];
      for (const childId of children) {
        if (typeof childId === 'string') childIds.add(childId);
      }
    }
    const freeNodes = updated.filter((node) => (
      String(asRecord(node.data).domain || '') === domain
      && isVisibleBusinessNode(node)
      && !childIds.has(node.id)
    ));
    if (freeNodes.length <= 1) continue;

    const byY = [...freeNodes].sort(
      (first, second) => nodeRectangle(first).y - nodeRectangle(second).y,
    );
    const verticallyPlaced: NodeRectangle[] = [];
    for (const node of byY) {
      const rectangle = nodeRectangle(node);
      let shiftY = 0;
      for (const placed of verticallyPlaced) {
        if (!projectionsOverlap(
          rectangle.x,
          rectangle.width,
          placed.x,
          placed.width,
        )) continue;
        shiftY = Math.max(
          shiftY,
          placed.y + placed.height + verticalGap - rectangle.y,
        );
      }
      if (shiftY > 0) {
        node.position = { x: rectangle.x, y: rectangle.y + shiftY };
      }
      verticallyPlaced.push({ ...rectangle, y: rectangle.y + Math.max(0, shiftY) });
    }

    const byX = [...freeNodes].sort(
      (first, second) => nodeRectangle(first).x - nodeRectangle(second).x,
    );
    const horizontallyPlaced: NodeRectangle[] = [];
    for (const node of byX) {
      const rectangle = nodeRectangle(node);
      let shiftX = 0;
      for (const placed of horizontallyPlaced) {
        if (!projectionsOverlap(
          rectangle.y,
          rectangle.height,
          placed.y,
          placed.height,
        )) continue;
        shiftX = Math.max(
          shiftX,
          placed.x + placed.width + horizontalGap - rectangle.x,
        );
      }
      if (shiftX > 0) {
        node.position = { x: rectangle.x + shiftX, y: rectangle.y };
      }
      horizontallyPlaced.push({ ...rectangle, x: rectangle.x + Math.max(0, shiftX) });
    }
  }
  return updated;
};
