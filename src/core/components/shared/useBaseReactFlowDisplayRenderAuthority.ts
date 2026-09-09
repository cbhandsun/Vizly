import type { Edge } from '@xyflow/react';
import { bindRoutingObservation, observeRoutingRenderFrame, recordRoutingObservation } from './baseReactFlowRoutingObservation';
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
  committedRenderEdges: readonly Edge[];
  rememberCommittedRenderAuthority: (
    baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
    edges: readonly Edge[],
  ) => void;
}> => {
  const [committedRenderState, setCommittedRenderState] = useState<Readonly<{
    authority: DisplayRoutingRenderAuthority | null;
    edges: readonly Edge[];
  }>>({ authority: null, edges: [] });
  const rememberCommittedRenderAuthority = useCallback((
    baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
    edges: readonly Edge[],
  ): void => {
    const resolution = resolveBaseReactFlowCommittedRenderAuthority(baseline, edges);
    if (resolution.authority) bindRoutingObservation(baseline, resolution.authority);
    updateDisplayRoutingDebugState({ renderAuthorityIssue: resolution.issue });
    setCommittedRenderState({
      authority: resolution.authority,
      edges: resolution.authority ? [...edges] : [],
    });
  }, []);
  return {
    committedRenderAuthority: committedRenderState.authority,
    committedRenderEdges: committedRenderState.edges,
    rememberCommittedRenderAuthority,
  };
};

export const resolveBaseReactFlowActiveRenderAuthority = ({
  committedRenderAuthority,
  inputSignature,
  inputGeometryDigest,
  displayedEdges,
  dragFallbackNodeIds = [],
  dragFallbackActive = false,
}: {
  committedRenderAuthority: DisplayRoutingRenderAuthority | null;
  inputSignature: string;
  inputGeometryDigest: string;
  displayedEdges: Edge[];
  dragFallbackNodeIds?: readonly string[];
  dragFallbackActive?: boolean;
}): Readonly<{
  authority: DisplayRoutingRenderAuthority | null;
  status: BaseReactFlowRenderAuthorityStatus;
}> => {
  if (!committedRenderAuthority) return { authority: null, status: 'missing-commit' };
  if (dragFallbackActive && dragFallbackNodeIds.length > 0) {
    const fallbackNodeIds = new Set(dragFallbackNodeIds);
    const edgeIds = new Set(displayedEdges.map(edge => edge.id));
    const authorized = edgeIds.size === displayedEdges.length
      && edgeIds.size === committedRenderAuthority.authorizedEdgeIds.size
      && displayedEdges.every(edge => {
        if (!committedRenderAuthority.authorizedEdgeIds.has(edge.id)) return false;
        const incident = fallbackNodeIds.has(edge.source) || fallbackNodeIds.has(edge.target);
        if (incident && edge.type !== 'smoothstep') return false;
        const data = edge.data && typeof edge.data === 'object'
          ? edge.data as Record<string, unknown>
          : null;
        return displayRoutingRenderAuthorityAllowsEdge(
          committedRenderAuthority,
          createDisplayRoutingRenderEdgeClaim({
            edgeId: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: edge.targetHandle ?? null,
            rendererType: incident ? 'stablePath' : edge.type ?? null,
            data,
          }),
        );
      });
    if (authorized) return { authority: committedRenderAuthority, status: 'accepted' };
  }
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
  dragFallbackNodeIds,
  dragFallbackActive,
}: {
  committedRenderAuthority: DisplayRoutingRenderAuthority | null;
  inputSignature: string;
  inputGeometryDigest: string;
  displayedEdges: Edge[];
  dragFallbackNodeIds: readonly string[];
  dragFallbackActive: boolean;
}): DisplayRoutingRenderAuthority | null => {
  const resolution = useMemo(
    () => resolveBaseReactFlowActiveRenderAuthority({
      committedRenderAuthority,
      inputSignature,
      inputGeometryDigest,
      displayedEdges,
      dragFallbackNodeIds,
      dragFallbackActive,
    }),
    [
      committedRenderAuthority,
      displayedEdges,
      dragFallbackActive,
      dragFallbackNodeIds,
      inputGeometryDigest,
      inputSignature,
    ],
  );
  useEffect(() => {
    updateDisplayRoutingDebugState({ renderAuthorityStatus: resolution.status });
    if (!resolution.authority) return;
    const authority = resolution.authority;
    recordRoutingObservation(authority, 'render-committed');
    if (typeof requestAnimationFrame !== 'function') return;
    // A frame callback is observable; it is not proof of pixel visibility.
    return observeRoutingRenderFrame(authority, requestAnimationFrame, cancelAnimationFrame);
  }, [resolution.status, resolution.authority]);
  return resolution.authority;
};
