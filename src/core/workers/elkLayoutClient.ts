import ELK from 'elkjs/lib/elk-api';
import type { ElkNode } from 'elkjs';

import elkWorkerUrl from 'virtual:vizly-elk-engine-worker-url';
import type {
  ElkLayoutExecutor,
  ElkLayoutRunOptions,
} from '../ports/elkLayoutExecutor';
import { redactSensitiveLogValue } from '../utils/logSecurity';

const DEFAULT_ELK_LAYOUT_TIMEOUT_MS = 30_000;
const MIN_ELK_LAYOUT_TIMEOUT_MS = 100;
const MAX_ELK_LAYOUT_TIMEOUT_MS = 120_000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export type ElkLayoutRequestOptions = ElkLayoutRunOptions;

const coerceTimeoutMs = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ELK_LAYOUT_TIMEOUT_MS;
  return Math.min(MAX_ELK_LAYOUT_TIMEOUT_MS, Math.max(MIN_ELK_LAYOUT_TIMEOUT_MS, Math.round(value)));
};

const parseLayoutOptions = (
  value: Record<string, unknown> | undefined,
): Record<string, string> => {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error('Invalid ELK layout options');
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

const createDisposedAbortError = (): Error => {
  const error = new Error('elk-layout-executor-disposed');
  error.name = 'AbortError';
  return error;
};

type ElkEngine = InstanceType<typeof ELK>;

type ActiveElkLayoutRequest = Readonly<{
  token: symbol;
  cancel: (error: Error) => void;
}>;

/**
 * Owns one reusable ELK engine. A successful request keeps the engine warm;
 * cancellation, timeout, protocol failure, or engine failure retires it so a
 * later request cannot queue behind stale or unhealthy work.
 */
export const createElkLayoutExecutor = (): ElkLayoutExecutor => {
  let engine: ElkEngine | null = null;
  let activeRequest: ActiveElkLayoutRequest | null = null;
  let disposed = false;

  const retireEngine = (candidate: ElkEngine): void => {
    if (engine === candidate) engine = null;
    try {
      candidate.terminateWorker();
    } catch {
      // Worker termination is best-effort. Invalidate ownership first so a
      // cleanup failure can neither mask the request result nor reuse a worker
      // whose health is unknown.
    }
  };

  const ensureEngine = (): ElkEngine => {
    if (!engine) engine = new ELK({ workerUrl: elkWorkerUrl });
    return engine;
  };

  const run = (
    graph: ElkNode,
    options: ElkLayoutRequestOptions = {},
  ): Promise<ElkNode> => new Promise((resolve, reject) => {
    if (disposed) {
      reject(createDisposedAbortError());
      return;
    }
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }
    if (!isValidElkResult(graph)) {
      reject(new Error('Invalid ELK graph'));
      return;
    }

    let layoutOptions: Record<string, string>;
    try {
      layoutOptions = parseLayoutOptions(options.layoutOptions);
    } catch {
      reject(new Error('Invalid ELK layout options'));
      return;
    }

    if (activeRequest) {
      reject(new Error('elk-layout-executor-busy'));
      return;
    }

    let requestEngine: ElkEngine;
    try {
      requestEngine = ensureEngine();
    } catch (error) {
      engine = null;
      reject(new Error(safeWorkerErrorMessage(error)));
      return;
    }

    const requestToken = Symbol('elk-layout-request');
    const timeoutMs = coerceTimeoutMs(options.timeoutMs);
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', handleAbort);
      if (activeRequest?.token === requestToken) activeRequest = null;
    };

    const settle = (callback: () => void, retire: boolean): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (retire) retireEngine(requestEngine);
      callback();
    };

    const handleAbort = (): void => {
      settle(() => reject(createAbortError()), true);
    };

    activeRequest = Object.freeze({
      token: requestToken,
      cancel: error => settle(() => reject(error), true),
    });
    const timeoutId = setTimeout(() => {
      settle(
        () => reject(new Error(`ELK layout timed out after ${timeoutMs}ms`)),
        true,
      );
    }, timeoutMs);
    options.signal?.addEventListener('abort', handleAbort, { once: true });
    // Close the narrow race where cancellation occurs after the initial check
    // but before the listener is attached.
    if (options.signal?.aborted) {
      handleAbort();
      return;
    }

    let layoutPromise: Promise<ElkNode>;
    try {
      layoutPromise = requestEngine.layout(graph, { layoutOptions });
    } catch (error) {
      settle(() => reject(new Error(safeWorkerErrorMessage(error))), true);
      return;
    }

    layoutPromise.then(
      (result) => {
        if (!isValidElkResult(result)) {
          settle(
            () => reject(new Error('ELK layout worker returned an invalid result')),
            true,
          );
          return;
        }
        settle(() => resolve(result), false);
      },
      (error) => settle(
        () => reject(new Error(safeWorkerErrorMessage(error))),
        true,
      ),
    );
  });

  return Object.freeze({
    run,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      activeRequest?.cancel(createDisposedAbortError());
      if (engine) retireEngine(engine);
    },
  });
};

/** Run an ELK request in a dedicated one-shot engine worker. */
export const runElkLayout = async (
  graph: ElkNode,
  options: ElkLayoutRequestOptions = {},
): Promise<ElkNode> => {
  const executor = createElkLayoutExecutor();
  try {
    return await executor.run(graph, options);
  } finally {
    executor.dispose();
  }
};
