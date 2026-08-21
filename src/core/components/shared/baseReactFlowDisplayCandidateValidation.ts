import type { Edge } from '@xyflow/react';

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
