import type { DisplayQualityMode } from './baseReactFlowDisplayWorkerProtocol';

export const DISPLAY_WORKER_TIMEOUT_MS = 60_000;
export const PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS = 120_000;
export const INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS = 12_000;

export const resolveBaseReactFlowDisplayWorkerTimeoutMs = (
  timeoutMs: number,
  qualityMode: DisplayQualityMode,
): number => {
  const maximumTimeoutMs = qualityMode === 'interactive'
    ? INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS
    : timeoutMs === PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS
      ? PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS
      : DISPLAY_WORKER_TIMEOUT_MS;
  const fallbackTimeoutMs = qualityMode === 'interactive'
    ? INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS
    : DISPLAY_WORKER_TIMEOUT_MS;
  const candidate = Number.isFinite(timeoutMs) ? Math.round(timeoutMs) : fallbackTimeoutMs;
  return Math.max(1_000, Math.min(candidate, maximumTimeoutMs));
};
