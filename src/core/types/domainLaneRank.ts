export type LaneRankMode = 'global' | 'compact';
export type LaneRankPreference = 'auto' | LaneRankMode;
export type LaneRankDirection = 'TB' | 'BT' | 'LR' | 'RL';

export type LaneRankMetrics = Readonly<{
  flowLength: number;
  whitespaceRatio: number;
  backwardTravel: number;
  backwardEdgeCount: number;
}>;

export type LaneRankDecisionReason =
  | 'manual-global' | 'manual-compact'
  | 'compact-benefit' | 'global-preserved' | 'hysteresis'
  | 'unchanged-connected-flow' | 'alternative-invalid';

/** Small, content-free explanation of a successfully committed lane layout. */
export type LaneRankDecision = Readonly<{
  version: 1;
  policyVersion: 1;
  requested: LaneRankPreference;
  applied: LaneRankMode;
  reason: LaneRankDecisionReason;
  direction: LaneRankDirection;
  connectedInputFingerprint: string;
  metrics: Readonly<{ global?: LaneRankMetrics; compact?: LaneRankMetrics }>;
  additionalBacktrackTravel?: number;
  score?: number;
  margin?: number;
  previousApplied?: LaneRankMode;
}>;
