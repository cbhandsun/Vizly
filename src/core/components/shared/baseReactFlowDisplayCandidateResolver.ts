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
 * Resolves external display candidates before a worker job starts. A signed
 * persistent candidate has priority; otherwise the generated registry is
 * loaded lazily. Callers must treat `null` as a stale/aborted schedule and must
 * not start a worker for it. A cache miss remains a valid resolution so the
 * same scheduled job can proceed directly to full routing.
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
  if (persistentCandidateEdges) {
    return {
      candidateEdges: persistentCandidateEdges,
      source: 'persistent',
    };
  }

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
  return candidateEdges
    ? { candidateEdges, source: 'precompiled' }
    : { candidateEdges: null, source: 'miss' };
};
