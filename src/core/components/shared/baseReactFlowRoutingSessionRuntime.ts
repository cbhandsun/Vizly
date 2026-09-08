import { useEffect, useState } from 'react';
import { recordRoutingObservation, startRoutingObservation } from './baseReactFlowRoutingObservation';
import type { MutableRefObject } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { layoutCandidateAcceptanceMatches, type LayoutCandidateAcceptance, type LayoutRouteProof } from '../../algorithms/layoutCandidateAcceptance';
import type { RoutingOnlyDocumentSnapshot } from '../../routing/persistedRoutingCandidate';
import { createBaseReactFlowDocumentSnapshotSource, type BaseReactFlowDocumentSnapshotSource,
  type DocumentSnapshotRoutingOptions } from './baseReactFlowDocumentSnapshotSource';

import {
  commitBaseReactFlowDisplaySnapshot,
  type BaseReactFlowDisplayCommittedSnapshotBaseline,
  type BaseReactFlowDisplaySnapshotCommitOptions,
} from './baseReactFlowDisplayCommittedSnapshot';

export type BaseReactFlowRoutingSessionJobOwner = 'display' | 'layout';

export type BaseReactFlowRoutingSessionJob = Readonly<{
  id: number;
  owner: BaseReactFlowRoutingSessionJobOwner;
  signal: AbortSignal;
}>;

export type BaseReactFlowRoutingSessionCommitResult<T> =
  | Readonly<{ committed: true; value: T }>
  | Readonly<{ committed: false }>;

export type BaseReactFlowRoutingSessionRuntime = Readonly<{
  workerRef: MutableRefObject<Worker | null>;
  beginJob: (owner: BaseReactFlowRoutingSessionJobOwner) => BaseReactFlowRoutingSessionJob;
  isCurrentJob: (job: BaseReactFlowRoutingSessionJob) => boolean;
  finishJob: (job: BaseReactFlowRoutingSessionJob) => boolean;
  cancelJob: (job: BaseReactFlowRoutingSessionJob) => boolean;
  commitJob: <T>(
    job: BaseReactFlowRoutingSessionJob,
    commit: () => T,
  ) => BaseReactFlowRoutingSessionCommitResult<T>;
  commitDisplaySnapshot: (
    options: BaseReactFlowDisplaySnapshotCommitOptions,
  ) => BaseReactFlowDisplayCommittedSnapshotBaseline | null;
  commitLayoutAcceptance: (acceptance: LayoutCandidateAcceptance, nodes: readonly Node[], route: LayoutRouteProof | null) => boolean;
  readLayoutAcceptance: () => LayoutCandidateAcceptance | null;
  rememberDocumentSnapshot: (baseline: BaseReactFlowDisplayCommittedSnapshotBaseline, options: DocumentSnapshotRoutingOptions) => void;
  createDocumentSnapshot: (nodes: Node[], edges: Edge[]) => RoutingOnlyDocumentSnapshot | null;
  registerWorkerDisposer: (
    disposer: (workerRef: MutableRefObject<Worker | null>) => void,
  ) => void;
  dispose: () => void;
}>;

type ActiveRoutingJob = Readonly<{
  publicJob: BaseReactFlowRoutingSessionJob;
  abortController: AbortController;
}>;

const terminateWorkerDirectly = (workerRef: MutableRefObject<Worker | null>): void => {
  workerRef.current?.terminate();
  workerRef.current = null;
};

/**
 * Owns the one Worker and one commit epoch for a mounted Canvas. Layout and
 * display routing may prepare work independently, but only the current job can
 * publish geometry. Beginning a new job invalidates and aborts its predecessor.
 */
export const createBaseReactFlowRoutingSessionRuntime = (
): BaseReactFlowRoutingSessionRuntime => {
  const workerRef: MutableRefObject<Worker | null> = { current: null };
  let nextJobId = 0;
  let activeJob: ActiveRoutingJob | null = null;
  let committingJob: BaseReactFlowRoutingSessionJob | null = null;
  let workerDisposer = terminateWorkerDirectly;
  let disposed = false;
  let documentSource: BaseReactFlowDocumentSnapshotSource | null = null;
  let layoutAcceptance: LayoutCandidateAcceptance | null = null;
  let pendingLayoutAcceptance: LayoutCandidateAcceptance | null = null;
  let hasPendingLayoutAcceptance = false;

  const isCurrentJob = (job: BaseReactFlowRoutingSessionJob): boolean => (
    !disposed
    && !job.signal.aborted
    && activeJob?.publicJob === job
  );

  const finishJob = (job: BaseReactFlowRoutingSessionJob): boolean => {
    if (committingJob || !isCurrentJob(job)) return false;
    recordRoutingObservation(job.signal, 'job-finished');
    activeJob = null;
    return true;
  };

  const cancelJob = (job: BaseReactFlowRoutingSessionJob): boolean => {
    if (committingJob || activeJob?.publicJob !== job) return false;
    recordRoutingObservation(job.signal, 'job-cancelled');
    activeJob.abortController.abort();
    activeJob = null;
    return true;
  };

  return {
    workerRef,
    beginJob: (owner) => {
      if (disposed) throw new Error('routing-session-runtime-disposed');
      const abortController = new AbortController();
      const publicJob = Object.freeze({
        id: nextJobId += 1,
        owner,
        signal: abortController.signal,
      });
      // State writers can synchronously trigger another layout/display intent.
      // That intent must not split the nodes/edges/selection write in progress.
      // Return an explicitly cancelled, unregistered job for the caller to drop.
      if (committingJob) {
        abortController.abort();
        return publicJob;
      }
      documentSource = null;
      if (activeJob) recordRoutingObservation(activeJob.publicJob.signal, 'job-cancelled');
      activeJob?.abortController.abort();
      startRoutingObservation(publicJob.signal, owner);
      activeJob = { publicJob, abortController };
      return publicJob;
    },
    isCurrentJob,
    finishJob,
    cancelJob,
    commitJob: (job, commit) => {
      if (committingJob || !isCurrentJob(job)) return { committed: false };
      committingJob = job;
      hasPendingLayoutAcceptance = false;
      try {
        const value = commit();
        if (!isCurrentJob(job)) return { committed: false };
        if (hasPendingLayoutAcceptance) layoutAcceptance = pendingLayoutAcceptance;
        if (activeJob?.publicJob === job) activeJob = null;
        return { committed: true, value };
      } finally {
        committingJob = null;
        hasPendingLayoutAcceptance = false;
        pendingLayoutAcceptance = null;
      }
    },
    commitDisplaySnapshot: options => {
      if (!committingJob || !isCurrentJob(committingJob)) return null;
      const snapshot = commitBaseReactFlowDisplaySnapshot(options);
      if (snapshot) {
        pendingLayoutAcceptance = snapshot.layoutAcceptance ?? null;
        hasPendingLayoutAcceptance = true;
      }
      return snapshot;
    },
    commitLayoutAcceptance: (acceptance, nodes, route) => {
      if (!committingJob || committingJob.owner !== 'layout' || !isCurrentJob(committingJob)
        || !layoutCandidateAcceptanceMatches(acceptance, nodes, route)) return false;
      pendingLayoutAcceptance = acceptance;
      hasPendingLayoutAcceptance = true;
      return true;
    },
    readLayoutAcceptance: () => layoutAcceptance,
    rememberDocumentSnapshot: (baseline, options) => {
      if (!disposed) documentSource = createBaseReactFlowDocumentSnapshotSource(baseline, options);
    },
    createDocumentSnapshot: (nodes, edges) => !disposed ? documentSource?.read(nodes, edges) ?? null : null,
    registerWorkerDisposer: (disposer) => {
      if (!disposed) workerDisposer = disposer;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      documentSource = null;
      layoutAcceptance = null;
      pendingLayoutAcceptance = null;
      hasPendingLayoutAcceptance = false;
      if (activeJob) recordRoutingObservation(activeJob.publicJob.signal, 'job-cancelled');
      activeJob?.abortController.abort();
      activeJob = null;
      committingJob = null;
      workerDisposer(workerRef);
    },
  };
};

const pendingDevelopmentDisposals = new WeakSet<BaseReactFlowRoutingSessionRuntime>();

/** Uses an injected Canvas runtime or owns a local one for standalone canvases. */
export const useBaseReactFlowRoutingSessionRuntime = (
  externalRuntime?: BaseReactFlowRoutingSessionRuntime,
): BaseReactFlowRoutingSessionRuntime => {
  const [ownedRuntime] = useState(createBaseReactFlowRoutingSessionRuntime);
  const runtime = externalRuntime ?? ownedRuntime;
  useEffect(() => {
    if (!import.meta.env.DEV) return () => ownedRuntime.dispose();
    pendingDevelopmentDisposals.delete(ownedRuntime);
    return () => {
      pendingDevelopmentDisposals.add(ownedRuntime);
      queueMicrotask(() => {
        if (pendingDevelopmentDisposals.delete(ownedRuntime)) ownedRuntime.dispose();
      });
    };
  }, [ownedRuntime]);
  return runtime;
};
