import ELK from 'elkjs/lib/elk-api';
import type { ElkNode } from 'elkjs';

import elkWorkerUrl from 'virtual:vizly-elk-engine-worker-url';
import { redactSensitiveLogValue } from '../utils/logSecurity';

const DEFAULT_ELK_LAYOUT_TIMEOUT_MS = 30_000;
const MIN_ELK_LAYOUT_TIMEOUT_MS = 100;
const MAX_ELK_LAYOUT_TIMEOUT_MS = 120_000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export interface ElkLayoutRequestOptions {
  layoutOptions?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const coerceTimeoutMs = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ELK_LAYOUT_TIMEOUT_MS;
  return Math.min(MAX_ELK_LAYOUT_TIMEOUT_MS, Math.max(MIN_ELK_LAYOUT_TIMEOUT_MS, Math.round(value)));
};

const parseLayoutOptions = (
  value: Record<string, unknown> | undefined,
): Record<string, string> => {
  if (!value) return {};
  const entries = Object.entries(value);
  if (!entries.every(([, option]) => typeof option === 'string')) {
    throw new Error('Invalid ELK layout options');
  }
  return Object.fromEntries(entries) as Record<string, string>;
};

const isValidElkResult = (value: unknown): value is ElkNode => (
  isRecord(value) && typeof value.id === 'string'
);

const safeWorkerErrorMessage = (error: unknown): string => {
  const redacted = redactSensitiveLogValue(error);
  if (typeof redacted === 'string' && redacted.trim()) return redacted;
  if (isRecord(redacted) && typeof redacted.message === 'string' && redacted.message.trim()) {
    return redacted.message;
  }
  return 'ELK layout worker failed';
};

const createAbortError = (): Error => {
  const error = new Error('ELK layout was cancelled');
  error.name = 'AbortError';
  return error;
};

/** Run an ELK request in a dedicated engine worker with bounded lifetime. */
export const runElkLayout = (
  graph: ElkNode,
  options: ElkLayoutRequestOptions = {},
): Promise<ElkNode> => new Promise((resolve, reject) => {
  if (options.signal?.aborted) {
    reject(createAbortError());
    return;
  }

  let layoutOptions: Record<string, string>;
  try {
    layoutOptions = parseLayoutOptions(options.layoutOptions);
  } catch {
    reject(new Error('Invalid ELK layout options'));
    return;
  }

  const elk = new ELK({ workerUrl: elkWorkerUrl });
  const timeoutMs = coerceTimeoutMs(options.timeoutMs);
  let settled = false;

  const cleanup = (): void => {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', handleAbort);
    elk.terminateWorker();
  };

  const settle = (callback: () => void): void => {
    if (settled) return;
    settled = true;
    cleanup();
    callback();
  };

  const handleAbort = (): void => settle(() => reject(createAbortError()));

  const timeoutId = setTimeout(() => {
    settle(() => reject(new Error(`ELK layout timed out after ${timeoutMs}ms`)));
  }, timeoutMs);

  options.signal?.addEventListener('abort', handleAbort, { once: true });
  elk.layout(graph, { layoutOptions }).then(
    (result) => {
      if (!isValidElkResult(result)) {
        settle(() => reject(new Error('ELK layout worker returned an invalid result')));
        return;
      }
      settle(() => resolve(result));
    },
    (error) => settle(() => reject(new Error(safeWorkerErrorMessage(error)))),
  );
});
