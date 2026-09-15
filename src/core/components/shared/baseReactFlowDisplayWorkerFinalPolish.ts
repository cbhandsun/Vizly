import type { Edge, Node } from '@xyflow/react';

import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';
import { repairDisplayContainerBoundarySkims } from './baseReactFlowDisplayContainerBoundarySkimRepair';
import {
  repairPostRenderEndpointOrthogonalPaths,
  repairPostRenderNearParallelOverlaps,
} from './baseReactFlowDisplayFullRoutePostRenderPhase';

type FinalPolishEvaluation = Readonly<{
  hardReport: (candidate: Edge[]) => Readonly<{ hardClean: boolean }>;
}>;

export const polishDisplayWorkerFinalRoutes = ({
  eligibleEdgeIds,
  evaluation,
  repairNodes,
  response,
}: {
  eligibleEdgeIds?: ReadonlySet<string>;
  evaluation: FinalPolishEvaluation;
  repairNodes: Node[];
  response: DisplayEdgesWorkerResponse;
}): Readonly<{
  response: DisplayEdgesWorkerResponse;
  routesChanged: boolean;
}> => {
  const boundarySkimFinalEdges = response.edges ? repairDisplayContainerBoundarySkims(
    response.edges,
    repairNodes,
    {
      eligibleEdgeIds,
      validateCandidate: context => context.candidateSkimLength < context.baselineSkimLength
        && evaluation.hardReport([...context.candidateEdges]).hardClean,
    },
  ) : null;
  const boundarySkimResponse = boundarySkimFinalEdges
    && !doBaseReactFlowDisplayRoutesMatchExactly(response.edges ?? [], boundarySkimFinalEdges)
    ? { ...response, edges: boundarySkimFinalEdges }
    : response;
  const orthogonalFinalEdges = boundarySkimResponse.edges
    ? repairPostRenderEndpointOrthogonalPaths(
      boundarySkimResponse.edges,
      repairNodes,
      candidate => evaluation.hardReport(candidate).hardClean,
    )
    : null;
  const visuallySeparatedFinalEdges = orthogonalFinalEdges
    ? repairPostRenderNearParallelOverlaps(
      orthogonalFinalEdges,
      candidate => evaluation.hardReport(candidate).hardClean,
    )
    : null;
  const polishedResponse = visuallySeparatedFinalEdges
    && !doBaseReactFlowDisplayRoutesMatchExactly(
      boundarySkimResponse.edges ?? [],
      visuallySeparatedFinalEdges,
    )
    ? { ...boundarySkimResponse, edges: visuallySeparatedFinalEdges }
    : boundarySkimResponse;
  return {
    response: polishedResponse,
    routesChanged: Boolean(response.edges
      && !doBaseReactFlowDisplayRoutesMatchExactly(response.edges, polishedResponse.edges ?? [])),
  };
};
