import { LayoutType } from '../types/layout';

type UnknownRecord = Record<string, unknown>;

export type DomainHorizontalNodeLayout = 'grid' | 'horizontal' | 'vertical' | 'centered' | 'dagre';
export type DomainHorizontalStopPhase = 'none' | 'phase1' | 'phase2';
export type DomainHorizontalSubDomainOrder = string[] | Record<string, string[]>;

export interface DomainHorizontalLayoutBoundary {
  padH: number;
  titleH: number;
  titleV: number;
  titleSafe: number;
  domainGapEffH: number;
  sideSafe: number;
  subPadH: number;
  subTitleH: number;
  subTitleV: number;
  subPadTop: number;
  subBottomSafe: number;
  nodeV: number;
  baseHGap: number;
  hGap: number;
  anchorTop: number;
  anchorLeft: number;
  domainWhitelist?: string[];
  subDomainWhitelist?: string[];
  showDomainGroups: boolean;
  showSubDomainGroups: boolean;
  domainOrder?: string[];
  subDomainOrder?: DomainHorizontalSubDomainOrder;
  nodeLayout: DomainHorizontalNodeLayout;
  stopAfterPhase?: DomainHorizontalStopPhase;
}

const asRecord = (value: unknown): UnknownRecord | undefined => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined
);

const readPath = (value: unknown, path: string[]): unknown => {
  let current: unknown = value;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
};

const firstDefined = (...values: unknown[]): unknown => values.find(value => value !== undefined);

export const boundedLayoutNumber = (
  value: unknown,
  fallback: number,
  min = 0,
  max = 10_000,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const boundedString = (value: unknown, maxLength = 200): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const boundedStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const result = [...new Set(value
    .slice(0, 1_000)
    .map(item => boundedString(item))
    .filter((item): item is string => Boolean(item)))];
  return result;
};

const coerceSubDomainOrder = (value: unknown): DomainHorizontalSubDomainOrder | undefined => {
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

const normalizeLayoutName = (value: unknown): string => (
  typeof value === 'string'
    ? value.toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
    : ''
);

const coerceNodeLayout = (value: unknown, fallbackValue: unknown): DomainHorizontalNodeLayout => {
  const byName: Record<string, DomainHorizontalNodeLayout> = {
    [normalizeLayoutName(LayoutType.GRID)]: 'grid',
    gridlayout: 'grid',
    grid: 'grid',
    [normalizeLayoutName(LayoutType.HORIZONTAL)]: 'horizontal',
    horizontallayout: 'horizontal',
    horizontal: 'horizontal',
    [normalizeLayoutName(LayoutType.VERTICAL)]: 'vertical',
    verticallayout: 'vertical',
    vertical: 'vertical',
    [normalizeLayoutName(LayoutType.CENTERED)]: 'centered',
    centeredlayout: 'centered',
    centered: 'centered',
    [normalizeLayoutName(LayoutType.DAGRE)]: 'dagre',
    dagrelayout: 'dagre',
    dagre: 'dagre',
  };
  return byName[normalizeLayoutName(value)] ?? byName[normalizeLayoutName(fallbackValue)] ?? 'vertical';
};

const coerceStopPhase = (value: unknown): DomainHorizontalStopPhase | undefined => {
  const normalized = boundedString(value, 16)?.toLowerCase().replace(/\s+/g, '');
  return normalized === 'phase1' || normalized === 'phase2' || normalized === 'none'
    ? normalized
    : undefined;
};

export const resolveDomainHorizontalLayoutBoundary = (
  config: unknown,
  layoutConfig: unknown,
  options: unknown,
): DomainHorizontalLayoutBoundary => {
  const padH = boundedLayoutNumber(readPath(config, ['domain', 'padding', 'horizontal']), 24);
  const horizontalScale = boundedLayoutNumber(readPath(config, ['layout', 'autoGapScale', 'h']), 1, 0, 10);
  const domainGap = boundedLayoutNumber(readPath(config, ['domain', 'gap']), 40, 0, 5_000);
  const subPaddingFallback = Math.max(16, Math.floor(padH * 0.8));
  const optionPaddingTop = readPath(options, ['padding', 'top']);
  const optionPaddingLeft = readPath(options, ['padding', 'left']);
  const configPaddingTop = readPath(config, ['diagram', 'padding', 'top']);
  const configPaddingLeft = readPath(config, ['diagram', 'padding', 'left']);
  const baseHGap = boundedLayoutNumber(readPath(layoutConfig, ['NODE_H_GAP']), 120, 0, 5_000);
  const optionRecord = asRecord(options);

  return {
    padH,
    titleH: boundedLayoutNumber(readPath(config, ['domain', 'title', 'height']), 40),
    titleV: boundedLayoutNumber(readPath(config, ['domain', 'title', 'padding', 'vertical']), 12),
    titleSafe: boundedLayoutNumber(readPath(config, ['domain', 'title', 'safeGap']), 16),
    domainGapEffH: Math.max(12, Math.round(domainGap * horizontalScale)),
    sideSafe: boundedLayoutNumber(readPath(config, ['domain', 'sideSafeGap']), 8),
    subPadH: boundedLayoutNumber(firstDefined(
      readPath(config, ['subDomain', 'padding', 'horizontal']),
      readPath(config, ['subGroup', 'padding', 'horizontal']),
      readPath(layoutConfig, ['SUB_GROUP_PADDING', 'H']),
    ), subPaddingFallback),
    subTitleH: boundedLayoutNumber(firstDefined(
      readPath(config, ['subDomain', 'title', 'height']),
      readPath(config, ['subGroup', 'title', 'height']),
    ), 28),
    subTitleV: boundedLayoutNumber(firstDefined(
      readPath(config, ['subDomain', 'title', 'padding', 'vertical']),
      readPath(config, ['subGroup', 'title', 'padding', 'vertical']),
    ), 8),
    subPadTop: boundedLayoutNumber(firstDefined(
      readPath(config, ['subDomain', 'padding', 'top']),
      readPath(layoutConfig, ['SUB_GROUP_PADDING', 'V_TOP']),
      readPath(config, ['subGroup', 'padding', 'top']),
      readPath(config, ['subGroup', 'padding', 'vertical']),
    ), subPaddingFallback),
    subBottomSafe: boundedLayoutNumber(firstDefined(
      readPath(config, ['subDomain', 'padding', 'bottom']),
      readPath(layoutConfig, ['SUB_GROUP_PADDING', 'V_BOTTOM_SAFE']),
      readPath(layoutConfig, ['SUB_GROUP_PADDING', 'V_BOTTOM']),
      readPath(config, ['subGroup', 'padding', 'bottom']),
      readPath(config, ['subGroup', 'padding', 'vertical']),
    ), subPaddingFallback),
    nodeV: boundedLayoutNumber(readPath(layoutConfig, ['NODE_V_GAP']), 80, 0, 5_000),
    baseHGap,
    hGap: Math.max(12, Math.floor(baseHGap * Math.min(1, horizontalScale))),
    anchorTop: Math.round(boundedLayoutNumber(
      optionPaddingTop,
      Math.max(40, boundedLayoutNumber(configPaddingTop, 40, -1_000_000, 1_000_000)),
      -1_000_000,
      1_000_000,
    )),
    anchorLeft: Math.round(boundedLayoutNumber(
      optionPaddingLeft,
      Math.max(40, boundedLayoutNumber(configPaddingLeft, 40, -1_000_000, 1_000_000)),
      -1_000_000,
      1_000_000,
    )),
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
    nodeLayout: coerceNodeLayout(optionRecord?.nodeLayout, readPath(config, ['diagram', 'layout', 'nodeStrategy'])),
    stopAfterPhase: coerceStopPhase(optionRecord?.stopAfterPhase),
  };
};
