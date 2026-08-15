export type BoundedSeedPolicyInput = Readonly<{
  skipFullRouteFallback: boolean | undefined;
  edgeCount: number;
  nodeCount: number;
}>;

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
