import type { Edge } from '@xyflow/react';

import {
  loadBaseReactFlowPrecompiledRouteCandidate,
  type BaseReactFlowPrecompiledRouteLookupInput,
} from './baseReactFlowPrecompiledRouteRegistry';

export type BaseReactFlowDisplayCandidateResolution = Readonly<{
  candidateEdges: Edge[] | null;
  source: 'persistent' | 'precompiled' | 'miss';
}>;

export type BaseReactFlowPrecompiledCandidateLoader = (
  input: BaseReactFlowPrecompiledRouteLookupInput,
) => Promise<Edge[] | null>;

const PRECOMPILED_CANDIDATE_LOAD_TIMEOUT_MS = 2_000;
const MIN_PRECOMPILED_CANDIDATE_LOAD_TIMEOUT_MS = 1_000;
const MAX_PRECOMPILED_CANDIDATE_LOAD_TIMEOUT_MS = 3_000;

export const resolveBaseReactFlowPrecompiledCandidateTimeoutMs = (value: number): number => {
  if (!Number.isFinite(value)) return PRECOMPILED_CANDIDATE_LOAD_TIMEOUT_MS;
  return Math.max(
    MIN_PRECOMPILED_CANDIDATE_LOAD_TIMEOUT_MS,
    Math.min(MAX_PRECOMPILED_CANDIDATE_LOAD_TIMEOUT_MS, Math.round(value)),
  );
};

/**
 * Resolves external display candidates before a worker job starts. A generated
 * precompiled artifact is tried first so an invalid persistent candidate cannot
 * force an expensive full route when a versioned artifact exists. Persistent
 * data remains the fallback for registry misses, failures, and bounded timeouts.
 * Callers must treat `null` as a stale/aborted schedule and must not start a
 * worker for it.
 */
export const resolveBaseReactFlowDisplayCandidate = async ({
  input,
  persistentCandidateEdges,
  signal,
  isCurrent,
  loadPrecompiledCandidate = loadBaseReactFlowPrecompiledRouteCandidate,
  loadTimeoutMs = PRECOMPILED_CANDIDATE_LOAD_TIMEOUT_MS,
}: {
  input: BaseReactFlowPrecompiledRouteLookupInput;
  persistentCandidateEdges: Edge[] | null;
  signal: AbortSignal;
  isCurrent: () => boolean;
  loadPrecompiledCandidate?: BaseReactFlowPrecompiledCandidateLoader;
  loadTimeoutMs?: number;
}): Promise<BaseReactFlowDisplayCandidateResolution | null> => {
  if (signal.aborted || !isCurrent()) return null;

  type LoadOutcome =
    | { kind: 'loaded'; candidateEdges: Edge[] | null }
    | { kind: 'timeout' }
    | { kind: 'aborted' };
  const loadOutcome = Promise.resolve()
    .then(() => loadPrecompiledCandidate(input))
    .then<LoadOutcome, LoadOutcome>(
      candidateEdges => ({ kind: 'loaded', candidateEdges }),
      () => ({ kind: 'loaded', candidateEdges: null }),
    );
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  const timeoutOutcome = new Promise<LoadOutcome>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ kind: 'timeout' }),
      resolveBaseReactFlowPrecompiledCandidateTimeoutMs(loadTimeoutMs),
    );
  });
  const abortOutcome = new Promise<LoadOutcome>((resolve) => {
    abortListener = () => resolve({ kind: 'aborted' });
    signal.addEventListener('abort', abortListener, { once: true });
  });
  const outcome = await Promise.race([loadOutcome, timeoutOutcome, abortOutcome]);
  if (timeoutId !== null) clearTimeout(timeoutId);
  if (abortListener) signal.removeEventListener('abort', abortListener);
  if (outcome.kind === 'aborted') return null;
  if (signal.aborted || !isCurrent()) return null;
  const candidateEdges = outcome.kind === 'loaded' ? outcome.candidateEdges : null;
  if (candidateEdges) return { candidateEdges, source: 'precompiled' };
  if (persistentCandidateEdges) {
    return { candidateEdges: persistentCandidateEdges, source: 'persistent' };
  }
  return { candidateEdges: null, source: 'miss' };
};
