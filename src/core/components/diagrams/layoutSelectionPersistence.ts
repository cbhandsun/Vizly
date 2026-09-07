import type {
  LaneRankDecision,
  LaneRankDecisionReason,
  LaneRankMetrics,
  LaneRankMode,
  LaneRankPreference,
} from '../../types/domainLaneRank';
import type { FlowchartLayoutDirection } from './flowchartLayoutStrategyMode';

const STRATEGIES = new Set([
  'domain-dagre',
  'domain-dagre-sub-horizontal',
  'dagre',
  'domain-lanes',
  'domain-horizontal',
  'domain-vertical',
  'domain-elk',
  'elk',
  'domain-compound-elk',
  'tree',
  'force',
]);
const NODE_LAYOUTS = new Set(['dagre', 'flow', 'grid', 'horizontal', 'vertical']);
const DIRECTIONS = new Set<FlowchartLayoutDirection>(['TB', 'BT', 'LR', 'RL']);
const PREFERENCES = new Set<LaneRankPreference>(['auto', 'global', 'compact']);
const MODES = new Set<LaneRankMode>(['global', 'compact']);
const REASONS = new Set<LaneRankDecisionReason>([
  'manual-global', 'manual-compact', 'compact-benefit', 'global-preserved',
  'hysteresis', 'unchanged-connected-flow', 'alternative-invalid',
]);
const MAX_FINGERPRINT_LENGTH = 256;
const MAX_METRIC_VALUE = 1_000_000_000;
const MAX_EDGE_COUNT = 100_000;

export type LayoutSelection = Readonly<{
  version: 2;
  strategy: string;
  direction: FlowchartLayoutDirection;
  nodeLayout: string;
  laneRankPreference: LaneRankPreference;
  laneRankDecision?: LaneRankDecision;
}>;

export const DEFAULT_LAYOUT_SELECTION: LayoutSelection = Object.freeze({
  version: 2,
  strategy: 'domain-dagre',
  direction: 'TB',
  nodeLayout: 'dagre',
  laneRankPreference: 'auto',
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const isLaneRankPreference = (value: unknown): value is LaneRankPreference => (
  typeof value === 'string' && PREFERENCES.has(value as LaneRankPreference)
);
const isLaneRankMode = (value: unknown): value is LaneRankMode => (
  typeof value === 'string' && MODES.has(value as LaneRankMode)
);
const isLaneRankReason = (value: unknown): value is LaneRankDecisionReason => (
  typeof value === 'string' && REASONS.has(value as LaneRankDecisionReason)
);
const isDirection = (value: unknown): value is FlowchartLayoutDirection => (
  typeof value === 'string' && DIRECTIONS.has(value as FlowchartLayoutDirection)
);

const isFiniteNumber = (value: unknown, minimum = 0, maximum = MAX_METRIC_VALUE): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
);

const parseMetrics = (value: unknown): LaneRankMetrics | null => {
  if (!isRecord(value)
    || !isFiniteNumber(value.flowLength)
    || !isFiniteNumber(value.whitespaceRatio, 0, 1)
    || !isFiniteNumber(value.backwardTravel)
    || !isFiniteNumber(value.backwardEdgeCount, 0, MAX_EDGE_COUNT)
    || !Number.isInteger(value.backwardEdgeCount)) return null;
  return { flowLength: value.flowLength, whitespaceRatio: value.whitespaceRatio,
    backwardTravel: value.backwardTravel, backwardEdgeCount: value.backwardEdgeCount };
};

const parseDecision = (value: unknown, preference: LaneRankPreference,
  direction: FlowchartLayoutDirection): LaneRankDecision | undefined => {
  if (!isRecord(value) || value.version !== 1 || value.policyVersion !== 1
    || !isLaneRankPreference(value.requested) || value.requested !== preference
    || !isLaneRankMode(value.applied) || !isLaneRankReason(value.reason)
    || !isDirection(value.direction) || value.direction !== direction
    || typeof value.connectedInputFingerprint !== 'string'
    || value.connectedInputFingerprint.length === 0
    || value.connectedInputFingerprint.length > MAX_FINGERPRINT_LENGTH
    || !isRecord(value.metrics)) return undefined;
  const global = typeof value.metrics.global === 'undefined' ? undefined : parseMetrics(value.metrics.global);
  const compact = typeof value.metrics.compact === 'undefined' ? undefined : parseMetrics(value.metrics.compact);
  if ((typeof value.metrics.global !== 'undefined' && !global)
    || (typeof value.metrics.compact !== 'undefined' && !compact)
    || !(value.applied === 'global' ? global : compact)
    || (preference !== 'auto' && (value.applied !== preference || value.reason !== `manual-${preference}`))
    || (preference === 'auto' && (value.reason === 'manual-global' || value.reason === 'manual-compact'))
    || (value.reason === 'compact-benefit' && value.applied !== 'compact')
    || (value.reason === 'global-preserved' && value.applied !== 'global')) return undefined;
  const optionalNumber = (candidate: unknown, minimum = -MAX_METRIC_VALUE): number | undefined => (
    typeof candidate === 'undefined' ? undefined : isFiniteNumber(candidate, minimum) ? candidate : undefined
  );
  const additionalBacktrackTravel = optionalNumber(value.additionalBacktrackTravel, 0);
  const score = optionalNumber(value.score);
  const margin = optionalNumber(value.margin, 0);
  if ((typeof value.additionalBacktrackTravel !== 'undefined' && additionalBacktrackTravel === undefined)
    || (typeof value.score !== 'undefined' && score === undefined)
    || (typeof value.margin !== 'undefined' && margin === undefined)
    || (typeof value.previousApplied !== 'undefined'
      && !isLaneRankMode(value.previousApplied))) return undefined;
  return {
    version: 1, policyVersion: 1, requested: value.requested, applied: value.applied,
    reason: value.reason, direction: value.direction,
    connectedInputFingerprint: value.connectedInputFingerprint,
    metrics: { ...(global ? { global } : {}), ...(compact ? { compact } : {}) },
    ...(additionalBacktrackTravel === undefined ? {} : { additionalBacktrackTravel }),
    ...(score === undefined ? {} : { score }), ...(margin === undefined ? {} : { margin }),
    ...(isLaneRankMode(value.previousApplied) ? { previousApplied: value.previousApplied } : {}),
  };
};

const parseBaseSelection = (value: Record<string, unknown>): Omit<LayoutSelection,
  'version' | 'laneRankPreference' | 'laneRankDecision'> | null => {
  if (typeof value.strategy !== 'string' || !STRATEGIES.has(value.strategy)
    || typeof value.nodeLayout !== 'string' || !NODE_LAYOUTS.has(value.nodeLayout)
    || !isDirection(value.direction)) return null;
  return { strategy: value.strategy, direction: value.direction, nodeLayout: value.nodeLayout };
};

/** Parses v1 and v2 data. V1 restores as auto with no applied mode and never triggers a layout. */
export const parseLayoutSelection = (value: unknown): LayoutSelection | null => {
  if (!isRecord(value)) return null;
  const base = parseBaseSelection(value);
  if (!base) return null;
  if (value.version === 1) return { ...base, version: 2, laneRankPreference: 'auto' };
  if (value.version !== 2 || !isLaneRankPreference(value.laneRankPreference)) return null;
  const decision = typeof value.laneRankDecision === 'undefined' ? undefined
    : parseDecision(value.laneRankDecision, value.laneRankPreference, base.direction);
  return { ...base, version: 2, laneRankPreference: value.laneRankPreference,
    ...(decision ? { laneRankDecision: decision } : {}) };
};

export const parsePersistedLayoutSelection = (metadata: unknown): LayoutSelection | null => (
  isRecord(metadata) ? parseLayoutSelection(metadata.layoutSelection) : null
);
