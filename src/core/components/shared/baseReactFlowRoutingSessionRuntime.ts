import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

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

  const isCurrentJob = (job: BaseReactFlowRoutingSessionJob): boolean => (
    !disposed
    && !job.signal.aborted
    && activeJob?.publicJob === job
  );

  const finishJob = (job: BaseReactFlowRoutingSessionJob): boolean => {
    if (!isCurrentJob(job)) return false;
    activeJob = null;
    return true;
  };

  const cancelJob = (job: BaseReactFlowRoutingSessionJob): boolean => {
    if (activeJob?.publicJob !== job) return false;
    activeJob.abortController.abort();
    activeJob = null;
    return true;
  };

  return {
    workerRef,
    beginJob: (owner) => {
      if (disposed) throw new Error('routing-session-runtime-disposed');
      activeJob?.abortController.abort();
      const abortController = new AbortController();
      const publicJob = Object.freeze({
        id: nextJobId += 1,
        owner,
        signal: abortController.signal,
      });
      activeJob = { publicJob, abortController };
      return publicJob;
    },
    isCurrentJob,
    finishJob,
    cancelJob,
    commitJob: (job, commit) => {
      if (!isCurrentJob(job)) return { committed: false };
      committingJob = job;
      try {
        const value = commit();
        if (activeJob?.publicJob === job) activeJob = null;
        return { committed: true, value };
      } finally {
        committingJob = null;
      }
    },
    commitDisplaySnapshot: options => (
      committingJob && isCurrentJob(committingJob)
        ? commitBaseReactFlowDisplaySnapshot(options)
        : null
    ),
    registerWorkerDisposer: (disposer) => {
      if (!disposed) workerDisposer = disposer;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      activeJob?.abortController.abort();
      activeJob = null;
      committingJob = null;
      workerDisposer(workerRef);
    },
  };
};

/** Uses an injected Canvas runtime or owns a local one for standalone canvases. */
export const useBaseReactFlowRoutingSessionRuntime = (
  externalRuntime?: BaseReactFlowRoutingSessionRuntime,
): BaseReactFlowRoutingSessionRuntime => {
  const [ownedRuntime] = useState(createBaseReactFlowRoutingSessionRuntime);
  const runtime = externalRuntime ?? ownedRuntime;
  useEffect(() => () => ownedRuntime.dispose(), [ownedRuntime]);
  return runtime;
};
