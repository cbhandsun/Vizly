import type { Edge } from '@xyflow/react';

import { readRoutingOnlyDocumentCandidate } from '../../routing/routingDocumentCandidateRegistry';
import { BASE_DISPLAY_ROUTING_VERSION } from './baseReactFlowDisplayCache';
import { mergeTrustedBaseReactFlowDisplayCacheEntry } from './baseReactFlowDisplayRoutingTransaction';

export const loadBaseReactFlowDocumentRouteCandidate = ({
  inputSignature,
  inputGeometryDigest,
  sourceEdges,
}: {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
}): Edge[] | null => {
  const candidate = readRoutingOnlyDocumentCandidate({
    routingVersion: BASE_DISPLAY_ROUTING_VERSION,
    inputSignature,
    inputGeometryDigest,
  });
  if (!candidate) return null;
  return mergeTrustedBaseReactFlowDisplayCacheEntry(sourceEdges, {
    edges: candidate.patches,
    hardClean: true,
    inputGeometryDigest: candidate.inputGeometryDigest,
    outputRouteSignature: candidate.outputRouteSignature,
  });
};
