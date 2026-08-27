import type { Edge } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';

import {
  createDisplayRoutingRenderAuthority,
  displayRoutingRenderAuthorityAllowsEdge,
  type DisplayRoutingRenderAuthority,
} from '../../routing/displayRoutingRenderAuthority';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayEdgeCore';
import type {
  BaseReactFlowDisplayCommittedSnapshotBaseline,
} from './baseReactFlowDisplayCommittedSnapshot';

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
    setCommittedRenderAuthority(createDisplayRoutingRenderAuthority({
      inputSignature: baseline.identity.inputSignature,
      inputGeometryDigest: baseline.identity.inputGeometryDigest,
      outputRouteSignature: baseline.outputRouteSignature,
      hardReportDigest: baseline.hardReportDigest,
      authorizedEdges: edges.flatMap((edge) => {
        const data = edge.data && typeof edge.data === 'object'
          ? edge.data as Record<string, unknown>
          : null;
        return Array.isArray(data?.computedPath) && data.computedPath.length >= 2
          ? [{ edgeId: edge.id, computedPath: data.computedPath }]
          : [];
      }),
      workerSessionRef: baseline.workerSessionRef,
    }));
  }, []);
  return { committedRenderAuthority, rememberCommittedRenderAuthority };
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
}): DisplayRoutingRenderAuthority | null => useMemo(() => {
  if (
    !committedRenderAuthority
    || committedRenderAuthority.inputSignature !== inputSignature
    || committedRenderAuthority.inputGeometryDigest !== inputGeometryDigest
    || computeBaseReactFlowDisplayOutputRouteSignature(displayedEdges)
      !== committedRenderAuthority.outputRouteSignature
    || !displayedEdges.every((edge) => {
      const data = edge.data && typeof edge.data === 'object'
        ? edge.data as Record<string, unknown>
        : null;
      return !Array.isArray(data?.computedPath)
        || displayRoutingRenderAuthorityAllowsEdge(
          committedRenderAuthority,
          edge.id,
          data.computedPath,
        );
    })
  ) return null;
  return committedRenderAuthority;
}, [committedRenderAuthority, displayedEdges, inputGeometryDigest, inputSignature]);
