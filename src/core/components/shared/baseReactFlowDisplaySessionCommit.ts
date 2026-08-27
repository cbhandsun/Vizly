import type { Edge, Node } from '@xyflow/react';
import type { RoutingPatch } from '../../routing/routingPatch';

import type {
  BaseReactFlowDisplayCommittedSnapshotBaseline,
} from './baseReactFlowDisplayCommittedSnapshot';
import { writeBaseReactFlowDisplayEdgesCache } from './baseReactFlowDisplayEdgeCore';
import { scheduleBaseReactFlowDisplayCacheWrite } from './baseReactFlowDisplayWorkerClient';
import type { DisplayRoutingWorkerCommitReceipt } from './baseReactFlowDisplayWorkerCommitReceipt';
import {
  createDisplayRoutingIdentity,
  displayRoutingIdentitiesMatch,
} from './baseReactFlowDisplayRoutingSession';
import type {
  BaseReactFlowRoutingSessionJob,
  BaseReactFlowRoutingSessionRuntime,
} from './baseReactFlowRoutingSessionRuntime';

export type BaseReactFlowDisplaySessionCommitResult = Readonly<{
  committed: boolean;
  cancelCacheWrite?: () => void;
}>;

/** Atomically publishes one hard-gated display result under its Canvas epoch. */
export const commitBaseReactFlowDisplaySessionResult = ({
  runtime,
  job,
  inputSignature,
  inputGeometryDigest,
  sourceEdges,
  sourceNodes,
  finalEdges,
  displayPatches,
  cachePatches,
  cacheReplaySignature,
  outputRouteSignature,
  commitReceipt,
  precompiledCapturePresetId,
  rememberCommittedBaseline,
  applyFinalGeometry,
}: {
  runtime: BaseReactFlowRoutingSessionRuntime;
  job: BaseReactFlowRoutingSessionJob;
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  finalEdges: Edge[];
  displayPatches: RoutingPatch[];
  cachePatches: RoutingPatch[] | null;
  cacheReplaySignature: string | null;
  outputRouteSignature: string | null;
  commitReceipt: DisplayRoutingWorkerCommitReceipt;
  precompiledCapturePresetId?: string | null;
  rememberCommittedBaseline: (
    baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
    edges: Edge[],
  ) => void;
  applyFinalGeometry: () => void;
}): BaseReactFlowDisplaySessionCommitResult => {
  const result = runtime.commitJob(job, () => {
    const expectedIdentity = createDisplayRoutingIdentity(
      inputSignature,
      inputGeometryDigest,
    );
    if (
      !displayRoutingIdentitiesMatch(commitReceipt.identity, expectedIdentity)
      || commitReceipt.outputRouteSignature !== outputRouteSignature
    ) return { accepted: false } as const;
    const baseline = runtime.commitDisplaySnapshot({
      inputSignature,
      inputGeometryDigest,
      sourceEdges,
      sourceNodes,
      displayPatches,
      outputRouteSignature,
      hardReport: commitReceipt.hardReport,
      workerSessionRef: commitReceipt.sessionRef,
      precompiledCapturePresetId,
    });
    if (!baseline) return { accepted: false } as const;
    rememberCommittedBaseline(baseline, finalEdges);
    applyFinalGeometry();
    if (cacheReplaySignature !== null && cachePatches) {
      const cancelCacheWrite = scheduleBaseReactFlowDisplayCacheWrite(() => {
        writeBaseReactFlowDisplayEdgesCache(inputSignature, cachePatches, {
          hardClean: true,
          inputGeometryDigest,
          outputRouteSignature: cacheReplaySignature,
        });
      });
      return { accepted: true, cancelCacheWrite } as const;
    }
    return { accepted: true } as const;
  });
  return result.committed && result.value.accepted
    ? {
      committed: true,
      ...(result.value.cancelCacheWrite
        ? { cancelCacheWrite: result.value.cancelCacheWrite }
        : {}),
    }
    : { committed: false };
};
