import type { Edge, Node } from '@xyflow/react';
import type { BaseReactFlowLayoutRoutingCommit } from '../../shared/baseReactFlowLayoutRoutingTransaction';

export type LayoutCandidate = Readonly<{ nodes: Node[]; edges: Edge[] }>;
export type RoutedLayoutCandidate = Readonly<{
  geometry: LayoutCandidate;
  staged: BaseReactFlowLayoutRoutingCommit;
}>;

const checkCancellation = (signal: AbortSignal): void => {
  if (signal.aborted) throw new Error('layout-routing-cancelled');
};

/** Evaluate one optional alternative without publishing or committing either
 * candidate. The caller commits only the returned candidate in its layout job. */
export const stagePreferredLayoutCandidate = async ({
  baseline,
  createAlternative,
  stage,
  preferAlternative,
  signal,
}: {
  baseline: LayoutCandidate;
  createAlternative?: () => Promise<LayoutCandidate | null>;
  stage: (candidate: LayoutCandidate) => Promise<BaseReactFlowLayoutRoutingCommit>;
  preferAlternative: (baseline: RoutedLayoutCandidate, alternative: RoutedLayoutCandidate) => boolean;
  signal: AbortSignal;
}): Promise<RoutedLayoutCandidate> => {
  checkCancellation(signal);
  const original = { geometry: baseline, staged: await stage(baseline) };
  checkCancellation(signal);
  if (!createAlternative) return original;
  const alternative = await createAlternative();
  checkCancellation(signal);
  if (!alternative) return original;
  let staged: BaseReactFlowLayoutRoutingCommit;
  try {
    staged = await stage(alternative);
  } catch (error) {
    checkCancellation(signal);
    // A rejected optional geometry is an ordinary comparison outcome. Runtime,
    // protocol, and timeout failures remain visible to the existing diagnostics.
    if (error instanceof Error && error.message === 'layout-routing-hard-quality-rejected') {
      return original;
    }
    throw error;
  }
  checkCancellation(signal);
  const proposed = { geometry: alternative, staged };
  return preferAlternative(original, proposed) ? proposed : original;
};
