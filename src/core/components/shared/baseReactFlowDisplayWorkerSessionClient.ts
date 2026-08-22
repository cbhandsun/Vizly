import type { RoutingWorkerSessionRef } from './baseReactFlowDisplayRoutingSession';

const knownSessionIds = new WeakMap<Worker, Set<string>>();

export const rememberDisplayWorkerSession = (
  worker: Worker | null,
  sessionRef: RoutingWorkerSessionRef | undefined,
): void => {
  if (!worker || !sessionRef) return;
  const known = knownSessionIds.get(worker) ?? new Set<string>();
  known.add(sessionRef.sessionId);
  knownSessionIds.set(worker, known);
};

export const displayWorkerKnowsSession = (
  worker: Worker | null,
  sessionRef: RoutingWorkerSessionRef | undefined,
): boolean => Boolean(
  worker
  && sessionRef
  && knownSessionIds.get(worker)?.has(sessionRef.sessionId),
);
