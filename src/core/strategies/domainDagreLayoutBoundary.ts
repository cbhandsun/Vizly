import type { Node } from '@xyflow/react';

type UnknownRecord = Record<string, unknown>;

export type DomainDagreDirection = 'TB' | 'BT' | 'LR' | 'RL';
export type DomainDagreSubDomainOrder = string[] | Record<string, string[]>;
export type DomainDagrePlacement = 'topology' | 'ordered-lanes';

export interface DomainDagreLayoutBoundary {
  domainGap: number;
  nodeGapH: number;
  nodeGapV: number;
  direction: DomainDagreDirection;
  subDomainNodeDirection: DomainDagreDirection;
  domainSubGroupDirection: DomainDagreDirection;
  titleSafe: number;
  bottomSafe: number;
  sideSafeGap: number;
  bottomSafeGap: number;
  widthCompensation: number;
  domainPaddingH: number;
  domainPaddingV: number;
  subDomainPaddingH: number;
  subDomainPaddingV: number;
  subDomainPaddingBottom: number;
  subDomainTitleH: number;
  domainTitleH: number;
  domainPlacement: DomainDagrePlacement;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
  domainWhitelist?: string[];
  subDomainWhitelist?: string[];
  showDomainGroups: boolean;
  showSubDomainGroups: boolean;
  domainOrder?: string[];
  subDomainOrder?: DomainDagreSubDomainOrder;
}

const asRecord = (value: unknown): UnknownRecord | undefined => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined
);

const readPath = (value: unknown, path: string[]): unknown => {
  let current = value;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
};

export const boundedDomainDagreNumber = (
  value: unknown,
  fallback: number,
  min = 0,
  max = 10_000,
): number => {
  const safeFallback = Number.isFinite(fallback) ? Math.min(max, Math.max(min, fallback)) : min;
  if (typeof value !== 'number' || !Number.isFinite(value)) return safeFallback;
  return Math.min(max, Math.max(min, value));
};

const boundedDimension = (value: unknown, fallback: number): number => {
  const safeFallback = boundedDomainDagreNumber(fallback, 1, 1, 10_000);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return safeFallback;
  return Math.min(10_000, value);
};

const boundedString = (value: unknown, maxLength = 200): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const boundedStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value
    .slice(0, 1_000)
    .map(item => boundedString(item))
    .filter((item): item is string => Boolean(item)))];
};

const coerceSubDomainOrder = (value: unknown): DomainDagreSubDomainOrder | undefined => {
  const direct = boundedStringArray(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return undefined;
  const result: Record<string, string[]> = {};
  for (const [rawDomain, rawOrder] of Object.entries(record).slice(0, 1_000)) {
    const domain = boundedString(rawDomain);
    const order = boundedStringArray(rawOrder);
    if (domain && order) result[domain] = order;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

export const coerceDomainDagreDirection = (
  value: unknown,
  fallback: DomainDagreDirection = 'TB',
): DomainDagreDirection => {
  const normalized = boundedString(value, 8)?.toUpperCase();
  return normalized === 'TB' || normalized === 'BT' || normalized === 'LR' || normalized === 'RL'
    ? normalized
    : fallback;
};

export const coerceDomainDagrePlacement = (value: unknown): DomainDagrePlacement => (
  boundedString(value, 32)?.toLowerCase() === 'ordered-lanes'
    ? 'ordered-lanes'
    : 'topology'
);

const normalizeSemanticKey = (value: unknown): string => (
  boundedString(value)?.toLowerCase()
    .replace(/\u3000|\u00a0/g, '')
    .replace(/\s+/g, '')
    .replace(/[+_-]/g, '') ?? ''
);

export const getDomainDagreSubDomainOrderIndex = (
  order: DomainDagreSubDomainOrder | undefined,
  domainKey: unknown,
  subDomainKey: unknown,
): number => {
  const domain = boundedString(domainKey) ?? '';
  const subDomain = boundedString(subDomainKey) ?? '';
  let candidates: string[] | undefined;
  if (Array.isArray(order)) {
    candidates = order;
  } else if (order) {
    candidates = order[domain];
    if (!candidates) {
      const normalizedDomain = normalizeSemanticKey(domain);
      const matchingDomain = Object.keys(order).find(key => normalizeSemanticKey(key) === normalizedDomain);
      candidates = matchingDomain ? order[matchingDomain] : undefined;
    }
  }
  if (!candidates) return Number.POSITIVE_INFINITY;
  const exact = candidates.indexOf(subDomain);
  if (exact >= 0) return exact;
  const normalizedSubDomain = normalizeSemanticKey(subDomain);
  const normalized = candidates.findIndex(candidate => normalizeSemanticKey(candidate) === normalizedSubDomain);
  return normalized >= 0 ? normalized : Number.POSITIVE_INFINITY;
};

export const resolveDomainDagreLayoutBoundary = (
  config: unknown,
  layoutConfig: unknown,
  options: unknown,
): DomainDagreLayoutBoundary => {
  const optionRecord = asRecord(options);
  const direction = coerceDomainDagreDirection(
    optionRecord?.direction,
    coerceDomainDagreDirection(readPath(config, ['diagram', 'layout', 'direction'])),
  );
  return {
    domainGap: boundedDomainDagreNumber(readPath(config, ['domain', 'gap']), 80, 0, 5_000),
    nodeGapH: boundedDomainDagreNumber(readPath(config, ['node', 'gap', 'horizontal']), 100, 40, 5_000),
    nodeGapV: boundedDomainDagreNumber(readPath(config, ['node', 'gap', 'vertical']), 60, 30, 5_000),
    direction,
    subDomainNodeDirection: coerceDomainDagreDirection(optionRecord?.subDomainNodeDirection, direction),
    domainSubGroupDirection: coerceDomainDagreDirection(optionRecord?.domainSubGroupDirection, direction),
    titleSafe: boundedDomainDagreNumber(readPath(layoutConfig, ['GROUP_TITLE_SAFE_GAP']), 8),
    bottomSafe: boundedDomainDagreNumber(readPath(layoutConfig, ['GROUP_BOTTOM_SAFE_GAP']), 12),
    sideSafeGap: boundedDomainDagreNumber(readPath(config, ['domain', 'sideSafeGap']), 0),
    bottomSafeGap: boundedDomainDagreNumber(readPath(config, ['domain', 'bottomSafeGap']), 0),
    widthCompensation: boundedDomainDagreNumber(readPath(config, ['domain', 'widthCompensation']), 1, 0.1, 10),
    domainPaddingH: boundedDomainDagreNumber(readPath(config, ['domain', 'padding', 'horizontal']), 24),
    domainPaddingV: boundedDomainDagreNumber(readPath(config, ['domain', 'padding', 'vertical']), 24),
    subDomainPaddingH: boundedDomainDagreNumber(readPath(config, ['subDomain', 'padding', 'horizontal']), 24),
    subDomainPaddingV: boundedDomainDagreNumber(readPath(config, ['subDomain', 'padding', 'vertical']), 24),
    subDomainPaddingBottom: boundedDomainDagreNumber(readPath(config, ['subDomain', 'padding', 'bottom']), 16),
    subDomainTitleH: boundedDomainDagreNumber(readPath(config, ['subDomain', 'title', 'height']), 48),
    domainTitleH: boundedDomainDagreNumber(readPath(config, ['domain', 'title', 'height']), 48),
    domainPlacement: coerceDomainDagrePlacement(optionRecord?.domainPlacement),
    defaultNodeWidth: boundedDomainDagreNumber(readPath(config, ['node', 'width']), 200, 1, 10_000),
    defaultNodeHeight: boundedDomainDagreNumber(readPath(config, ['node', 'height']), 80, 1, 10_000),
    domainWhitelist: boundedStringArray(optionRecord?.domainWhitelist),
    subDomainWhitelist: boundedStringArray(optionRecord?.subDomainWhitelist),
    showDomainGroups: typeof optionRecord?.generateDomainGroups === 'boolean'
      ? optionRecord.generateDomainGroups
      : true,
    showSubDomainGroups: typeof optionRecord?.generateSubDomainGroups === 'boolean'
      ? optionRecord.generateSubDomainGroups
      : true,
    domainOrder: boundedStringArray(optionRecord?.domainOrder),
    subDomainOrder: coerceSubDomainOrder(optionRecord?.subDomainOrder),
  };
};

export const normalizeDomainDagreNodes = (
  nodes: unknown,
  defaultWidth: number,
  defaultHeight: number,
): Node[] => {
  if (!Array.isArray(nodes)) return [];
  const fallbackWidth = boundedDomainDagreNumber(defaultWidth, 200, 1, 10_000);
  const fallbackHeight = boundedDomainDagreNumber(defaultHeight, 80, 1, 10_000);
  return nodes.flatMap(value => {
    const node = asRecord(value) as unknown as Node | undefined;
    if (!node || typeof node.id !== 'string' || !asRecord(node.position) || !asRecord(node.data)) return [];
    const style = asRecord(node.style);
    const measured = asRecord(node.measured);
    const width = boundedDimension(
      style?.width ?? measured?.width ?? node.width,
      fallbackWidth,
    );
    const height = boundedDimension(
      style?.height ?? measured?.height ?? node.height,
      fallbackHeight,
    );
    return [{
      ...node,
      position: {
        x: boundedDomainDagreNumber(node.position.x, 0, -1_000_000, 1_000_000),
        y: boundedDomainDagreNumber(node.position.y, 0, -1_000_000, 1_000_000),
      },
      data: { ...node.data },
      measured: { width, height },
    }];
  });
};

export const getDomainDagreNodeDimensions = (
  node: Node,
  defaultWidth: number,
  defaultHeight: number,
): { width: number; height: number } => {
  const style = asRecord(node.style);
  return {
    width: boundedDimension(
      style?.width ?? node.measured?.width ?? node.width,
      defaultWidth,
    ),
    height: boundedDimension(
      style?.height ?? node.measured?.height ?? node.height,
      defaultHeight,
    ),
  };
};
