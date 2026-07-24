import type { Node as ReactFlowNode } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

interface GapMetrics {
  domainPadding: number;
  domainTitleHeight: number;
  domainTitlePadding: number;
  domainTitleSafeGap: number;
  domainSideSafeGap: number;
  subGroupHorizontalPadding: number;
  subGroupTopPadding: number;
  subGroupTitleHeight: number;
  subGroupTitlePadding: number;
  horizontalGap: number;
  verticalGap: number;
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

const firstDefined = (...values: unknown[]): unknown => (
  values.find(value => value !== undefined && value !== null)
);

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

const domainKey = (node: ReactFlowNode): string => (
  String(asRecord(node.data).domain || '').trim()
);

const nodeWidth = (node: ReactFlowNode): number => (
  spacing(node.measured?.width ?? node.style?.width ?? node.width, 0)
);

const nodeHeight = (node: ReactFlowNode): number => (
  spacing(node.measured?.height ?? node.style?.height ?? node.height, 0)
);

const resolveMetrics = (
  horizontalGapOverride: unknown,
  verticalGapOverride: unknown,
  layoutConfig: unknown,
  config: unknown,
): GapMetrics => {
  const domainPadding = spacing(
    nestedValue(config, 'domain', 'padding', 'horizontal'),
    24,
  );
  return {
    domainPadding,
    domainTitleHeight: spacing(
      nestedValue(config, 'domain', 'title', 'height'),
      40,
    ),
    domainTitlePadding: spacing(
      nestedValue(config, 'domain', 'title', 'padding', 'vertical'),
      12,
    ),
    domainTitleSafeGap: spacing(
      nestedValue(config, 'domain', 'title', 'safeGap'),
      16,
    ),
    domainSideSafeGap: Math.max(
      12,
      spacing(nestedValue(config, 'domain', 'sideSafeGap'), 12),
    ),
    subGroupHorizontalPadding: spacing(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
    ), Math.max(16, Math.floor(domainPadding * 0.8))),
    subGroupTopPadding: spacing(firstDefined(
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_TOP'),
      nestedValue(config, 'subDomain', 'padding', 'top'),
      nestedValue(config, 'subDomain', 'padding', 'vertical'),
    ), Math.max(12, Math.floor(domainPadding * 0.8))),
    subGroupTitleHeight: spacing(
      nestedValue(config, 'subDomain', 'title', 'height'),
      28,
    ),
    subGroupTitlePadding: spacing(
      nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
      8,
    ),
    horizontalGap: spacing(
      horizontalGapOverride,
      spacing(nestedValue(layoutConfig, 'NODE_H_GAP'), 120),
    ),
    verticalGap: spacing(
      verticalGapOverride,
      spacing(nestedValue(layoutConfig, 'NODE_V_GAP'), 80),
    ),
  };
};

const semanticComparison = (
  left: ReactFlowNode,
  right: ReactFlowNode,
  customSort: ((a: ReactFlowNode, b: ReactFlowNode) => number) | undefined,
): number => {
  if (!customSort) return 0;
  const result = customSort(left, right);
  return Number.isFinite(result) ? result : 0;
};

export const unifySubGroupGapsInDomainWithConfig = (
  nodeInputs: ReactFlowNode[],
  horizontalGapOverride: unknown,
  verticalGapOverride: unknown,
  customSort: ((a: ReactFlowNode, b: ReactFlowNode) => number) | undefined,
  layoutConfig: unknown,
  config: unknown,
): ReactFlowNode[] => {
  const updated = nodeInputs.map(cloneNode);
  const nodeById = new Map(updated.map(node => [node.id, node]));
  const metrics = resolveMetrics(
    horizontalGapOverride,
    verticalGapOverride,
    layoutConfig,
    config,
  );

  for (const domain of updated.filter(
    node => String(node.type || '') === 'titleGroup',
  )) {
    const key = domainKey(domain);
    if (!key) continue;
    const innerLeft = domain.position.x + metrics.domainPadding;
    const innerTop = (
      domain.position.y
      + metrics.domainTitleHeight
      + metrics.domainTitlePadding
      + metrics.domainTitleSafeGap
    );
    const subGroups = updated.filter(node => (
      String(node.type || '') === 'subGroup'
      && domainKey(node) === key
      && !asRecord(node.data).hidden
    ));
    if (!subGroups.length) continue;

    const fallbackX = innerLeft - metrics.subGroupHorizontalPadding;
    const fallbackY = (
      innerTop
      - metrics.subGroupTitleHeight
      - metrics.subGroupTitlePadding
      - metrics.subGroupTopPadding
    );
    const xOf = (node: ReactFlowNode) => boundedNumber(node.position?.x, fallbackX);
    const yOf = (node: ReactFlowNode) => boundedNumber(node.position?.y, fallbackY);
    const averageHeight = Math.max(
      24,
      Math.floor(
        subGroups.reduce((sum, node) => sum + nodeHeight(node), 0)
        / subGroups.length,
      ),
    );
    const rowTolerance = Math.max(
      6,
      Math.floor(Math.min(metrics.verticalGap * 0.35, averageHeight * 0.5)),
    );
    const rows: ReactFlowNode[][] = [];
    const semanticIndex = new Map(
      subGroups.map((node, index) => [node.id, index]),
    );
    const sorted = subGroups.slice().sort((left, right) => (
      semanticComparison(left, right, customSort)
      || yOf(left) - yOf(right)
      || (semanticIndex.get(left.id) || 0) - (semanticIndex.get(right.id) || 0)
    ));
    for (const subGroup of sorted) {
      const y = yOf(subGroup);
      const matchingRow = rows.find(row => {
        const averageY = row.reduce((sum, node) => sum + yOf(node), 0) / row.length;
        return Math.abs(y - averageY) <= rowTolerance;
      });
      if (matchingRow) matchingRow.push(subGroup);
      else rows.push([subGroup]);
    }

    const verticalExtra = Math.max(4, Math.floor(metrics.verticalGap * 0.35));
    let cursorY = fallbackY + verticalExtra;
    for (const row of rows) {
      const ordered = row.slice().sort((left, right) => (
        semanticComparison(left, right, customSort)
        || xOf(left) - xOf(right)
        || (semanticIndex.get(left.id) || 0) - (semanticIndex.get(right.id) || 0)
      ));
      let cursorX = fallbackX + metrics.domainSideSafeGap;
      let rowMaximumHeight = 0;
      for (const subGroup of ordered) {
        const targetX = Math.round(boundedNumber(cursorX, fallbackX));
        const targetY = Math.round(boundedNumber(cursorY, fallbackY));
        const shiftX = targetX - xOf(subGroup);
        const shiftY = targetY - yOf(subGroup);
        subGroup.position = { x: targetX, y: targetY };
        const children = asRecord(subGroup.data).children;
        if (Array.isArray(children) && (shiftX || shiftY)) {
          for (const childId of children) {
            if (typeof childId !== 'string') continue;
            const child = nodeById.get(childId);
            if (!child) continue;
            child.position = {
              x: Math.round(boundedNumber(
                boundedNumber(child.position?.x, innerLeft) + shiftX,
                targetX,
              )),
              y: Math.round(boundedNumber(
                boundedNumber(child.position?.y, innerTop) + shiftY,
                targetY,
              )),
            };
          }
        }
        cursorX += nodeWidth(subGroup) + Math.max(12, metrics.horizontalGap);
        rowMaximumHeight = Math.max(rowMaximumHeight, nodeHeight(subGroup));
      }
      cursorY += (
        rowMaximumHeight
        + Math.max(6, Math.floor(metrics.verticalGap * 0.8))
      );
    }

    for (const subGroup of subGroups) {
      subGroup.position = {
        x: xOf(subGroup),
        y: Math.round(boundedNumber(
          yOf(subGroup) + verticalExtra,
          fallbackY,
        )),
      };
      const children = asRecord(subGroup.data).children;
      if (!Array.isArray(children)) continue;
      for (const childId of children) {
        if (typeof childId !== 'string') continue;
        const child = nodeById.get(childId);
        if (!child) continue;
        child.position = {
          x: boundedNumber(child.position?.x, innerLeft),
          y: Math.round(boundedNumber(
            boundedNumber(child.position?.y, innerTop) + verticalExtra,
            innerTop,
          )),
        };
      }
    }
  }

  return updated;
};
