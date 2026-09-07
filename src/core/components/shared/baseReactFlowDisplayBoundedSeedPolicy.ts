export type BoundedSeedPolicyInput = Readonly<{
  skipFullRouteFallback: boolean | undefined;
  edgeCount: number;
  nodeCount: number;
}>;

const DEFERRED_GLOBAL_CANDIDATE_EDGE_THRESHOLD = 24;
const DEFERRED_GLOBAL_CANDIDATE_EDGE_BUDGET = 12;

export const getInteractiveGlobalCandidateEdgeBudget = (
  edgeCount: number,
  deferOuterObstacleRepair: boolean,
): number | undefined => (
  deferOuterObstacleRepair && edgeCount > DEFERRED_GLOBAL_CANDIDATE_EDGE_THRESHOLD
    ? DEFERRED_GLOBAL_CANDIDATE_EDGE_BUDGET
    : undefined
);

const toSafeCount = (value: number): number =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

/**
 * Large graphs already receive a comprehensive FullRoute pass immediately
 * after this bounded seed. Avoid repeating the same global edge-pair search in
 * both phases when the bounded terminal-safe seed is not yet hard-clean.
 */
export const shouldStopAfterBoundedTerminalLaneSeed = ({
  skipFullRouteFallback,
  edgeCount,
  nodeCount,
}: BoundedSeedPolicyInput): boolean =>
  skipFullRouteFallback === true
  && (toSafeCount(edgeCount) > 24 || toSafeCount(nodeCount) > 40);
