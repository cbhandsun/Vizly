import type { createAlignedLaneComparison } from './alignedLaneLayout';
import type { RoutedLayoutCandidate } from './layoutCandidateSelection';

type AlignedOptions = Parameters<typeof createAlignedLaneComparison>[0];

/** Selects one structural comparison; focused layouts keep their untouched nodes. */
export async function createLayoutAlternativeComparison({
  compactGroups, globalLanes, hasPreservedNodes, decision, ...input
}: Omit<AlignedOptions, 'decision'> & {
  decision?: AlignedOptions['decision'];
  compactGroups: boolean;
  globalLanes: boolean;
  hasPreservedNodes: boolean;
}) {
  if (hasPreservedNodes) return undefined;
  if (compactGroups) {
    const comparison = await import('./compactGroupedLayout');
    return {
      create: () => comparison.createCompactGroupedLayout(
        input.nodes, input.edges, input.options, input.direction, input.context,
      ),
      prefer: (baseline: RoutedLayoutCandidate, alternative: RoutedLayoutCandidate) =>
        comparison.preferCompactGroupedLayout(baseline, alternative, input.direction),
    };
  }
  if (!globalLanes || decision?.applied !== 'global') return undefined;
  const comparison = await import('./alignedLaneLayout');
  return comparison.createAlignedLaneComparison({ ...input, decision });
}
