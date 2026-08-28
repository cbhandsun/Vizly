import type { Edge } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createDisplayRoutingRenderEdgeClaim,
  createDisplayRoutingRenderAuthority,
  displayRoutingRenderAuthorityAllowsEdge,
  type DisplayRoutingRenderAuthority,
} from '../../routing/displayRoutingRenderAuthority';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayEdgeCore';
import {
  isBaseReactFlowDisplayCommittedSnapshotBaselineTrusted,
  type BaseReactFlowDisplayCommittedSnapshotBaseline,
} from './baseReactFlowDisplayCommittedSnapshot';
import {
  updateDisplayRoutingDebugState,
  type BaseReactFlowRenderAuthorityIssue,
  type BaseReactFlowRenderAuthorityStatus,
} from './baseReactFlowDisplayRoutingDebug';

export type BaseReactFlowCommittedRenderAuthorityResolution = Readonly<{
  authority: DisplayRoutingRenderAuthority | null;
  issue?: BaseReactFlowRenderAuthorityIssue;
}>;

export const resolveBaseReactFlowCommittedRenderAuthority = (
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
  edges: readonly Edge[],
): BaseReactFlowCommittedRenderAuthorityResolution => {
  if (!isBaseReactFlowDisplayCommittedSnapshotBaselineTrusted(baseline)) {
    return { authority: null, issue: 'untrusted-baseline' };
  }
  if (!baseline.workerSessionRef) {
    return { authority: null, issue: 'missing-worker-session' };
  }
  if (!baseline.hardReport) {
    return { authority: null, issue: 'missing-hard-report' };
  }
  if (computeBaseReactFlowDisplayOutputRouteSignature(edges)
      !== baseline.outputRouteSignature) {
    return { authority: null, issue: 'output-signature-mismatch' };
  }
  const authority = createDisplayRoutingRenderAuthority({
    inputSignature: baseline.identity.inputSignature,
    inputGeometryDigest: baseline.identity.inputGeometryDigest,
    outputRouteSignature: baseline.outputRouteSignature,
    hardReport: baseline.hardReport,
    authorizedEdges: edges.flatMap((edge) => {
      const data = edge.data && typeof edge.data === 'object'
        ? edge.data as Record<string, unknown>
        : null;
      return Array.isArray(data?.computedPath) && data.computedPath.length >= 2
        ? [createDisplayRoutingRenderEdgeClaim({
          edgeId: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
          rendererType: edge.type ?? null,
          data,
        })]
        : [];
    }),
    workerSessionRef: baseline.workerSessionRef,
  });
  return authority
    ? { authority }
    : { authority: null, issue: 'invalid-authority-payload' };
};

export const createBaseReactFlowCommittedRenderAuthority = (
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
  edges: readonly Edge[],
): DisplayRoutingRenderAuthority | null => {
  return resolveBaseReactFlowCommittedRenderAuthority(baseline, edges).authority;
};

export const useBaseReactFlowCommittedRenderAuthority = (): Readonly<{
  committedRenderAuthority: DisplayRoutingRenderAuthority | null;
  rememberCommittedRenderAuthority: (
    baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
    edges: readonly Edge[],
  ) => void;
}> => {
  const [committedRenderAuthority, setCommittedRenderAuthority] = useState<
    DisplayRoutingRenderAuthority | null
  >(null);
  const rememberCommittedRenderAuthority = useCallback((
    baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
    edges: readonly Edge[],
  ): void => {
    const resolution = resolveBaseReactFlowCommittedRenderAuthority(baseline, edges);
    updateDisplayRoutingDebugState({ renderAuthorityIssue: resolution.issue });
    setCommittedRenderAuthority(resolution.authority);
  }, []);
  return { committedRenderAuthority, rememberCommittedRenderAuthority };
};

export const resolveBaseReactFlowActiveRenderAuthority = ({
  committedRenderAuthority,
  inputSignature,
  inputGeometryDigest,
  displayedEdges,
}: {
  committedRenderAuthority: DisplayRoutingRenderAuthority | null;
  inputSignature: string;
  inputGeometryDigest: string;
  displayedEdges: Edge[];
}): Readonly<{
  authority: DisplayRoutingRenderAuthority | null;
  status: BaseReactFlowRenderAuthorityStatus;
}> => {
  if (!committedRenderAuthority) return { authority: null, status: 'missing-commit' };
  if (committedRenderAuthority.inputSignature !== inputSignature) {
    return { authority: null, status: 'input-signature-mismatch' };
  }
  if (committedRenderAuthority.inputGeometryDigest !== inputGeometryDigest) {
    return { authority: null, status: 'input-geometry-mismatch' };
  }
  if (computeBaseReactFlowDisplayOutputRouteSignature(displayedEdges)
      !== committedRenderAuthority.outputRouteSignature) {
    return { authority: null, status: 'output-signature-mismatch' };
  }
  if (!displayedEdges.every((edge) => {
      const data = edge.data && typeof edge.data === 'object'
        ? edge.data as Record<string, unknown>
        : null;
      return !Array.isArray(data?.computedPath)
        || displayRoutingRenderAuthorityAllowsEdge(
          committedRenderAuthority,
          createDisplayRoutingRenderEdgeClaim({
            edgeId: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: edge.targetHandle ?? null,
            rendererType: edge.type ?? null,
            data,
          }),
        );
    })) return { authority: null, status: 'edge-claim-mismatch' };
  return { authority: committedRenderAuthority, status: 'accepted' };
};

export const useBaseReactFlowActiveRenderAuthority = ({
  committedRenderAuthority,
  inputSignature,
  inputGeometryDigest,
  displayedEdges,
}: {
  committedRenderAuthority: DisplayRoutingRenderAuthority | null;
  inputSignature: string;
  inputGeometryDigest: string;
  displayedEdges: Edge[];
}): DisplayRoutingRenderAuthority | null => {
  const resolution = useMemo(
    () => resolveBaseReactFlowActiveRenderAuthority({
      committedRenderAuthority,
      inputSignature,
      inputGeometryDigest,
      displayedEdges,
    }),
    [
      committedRenderAuthority,
      displayedEdges,
      inputGeometryDigest,
      inputSignature,
    ],
  );
  useEffect(() => {
    updateDisplayRoutingDebugState({ renderAuthorityStatus: resolution.status });
  }, [resolution.status]);
  return resolution.authority;
};
