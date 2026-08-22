import type { Edge } from '@xyflow/react';

import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';

export const doesDisplayCandidateMatchSourceGraph = (
  sourceEdges: Edge[],
  candidateEdges: Edge[],
): boolean => (
  sourceEdges.length === candidateEdges.length
  && sourceEdges.every((edge, index) => {
    const candidate = candidateEdges[index];
    return candidate?.id === edge.id
      && candidate.source === edge.source
      && candidate.target === edge.target;
  })
);

export const finalDisplayRenderContractIsLocked = (
  sourceEdges: Edge[],
  lockedEdges: Edge[],
): boolean => sourceEdges.length === lockedEdges.length
  && lockedEdges.every((edge, index) => edge === sourceEdges[index]);

export const analyzeFinalDisplayRenderContract = (
  sourceEdges: Edge[],
  lockedEdges: Edge[],
): Readonly<{
  renderContractIsLocked: boolean;
  lockedRouteMatches: boolean;
  lockedHardGateInputsMatch: boolean;
}> => {
  const renderContractIsLocked = finalDisplayRenderContractIsLocked(sourceEdges, lockedEdges);
  const lockedRouteMatches = renderContractIsLocked
    || doBaseReactFlowDisplayRoutesMatchExactly(sourceEdges, lockedEdges);
  return {
    renderContractIsLocked,
    lockedRouteMatches,
    lockedHardGateInputsMatch: lockedRouteMatches && sourceEdges.every((edge, index) => {
      const locked = lockedEdges[index];
      return locked?.id === edge.id
        && locked.source === edge.source
        && locked.target === edge.target
        && locked.sourceHandle === edge.sourceHandle
        && locked.targetHandle === edge.targetHandle;
    }),
  };
};

/** Retains request-local audit caches when a repair materializes no geometry. */
export const selectHardCleanDisplayCandidate = <T extends Edge[]>(
  auditedBaseline: T,
  candidate: T,
  isHardClean: (edges: T) => boolean,
): T => {
  if (
    analyzeFinalDisplayRenderContract(auditedBaseline, candidate)
      .lockedHardGateInputsMatch
  ) return auditedBaseline;
  return isHardClean(auditedBaseline) && !isHardClean(candidate)
    ? auditedBaseline
    : candidate;
};
