import { initDevConsoleFilters } from '@/core/utils/consoleCleanup';
import { initGlobalErrorHandling } from '@/core/utils/globalErrorHandler';
import { performanceMonitor } from '@/core/utils/performanceMonitor';
import { logDataRegistryBootstrapFailure } from '@/main/appBootstrapLogging';

const DATA_REGISTRY_BACKGROUND_WARMUP_DELAY_MS = 8_000;
const DATA_REGISTRY_IDLE_TIMEOUT_MS = 15_000;

export interface WarmupWindowLike {
  setTimeout(callback: () => void, delay?: number): unknown;
  addEventListener?(type: 'load', listener: () => void, options?: AddEventListenerOptions): void;
  requestIdleCallback?(callback: () => void, options?: { timeout: number }): unknown;
}

export interface DataRegistryWarmupOptions {
  loadDataRegistry?: () => Promise<void>;
  logFailure?: (error: unknown) => void;
  /** `null` explicitly selects the non-browser execution path. */
  windowLike?: WarmupWindowLike | null;
  documentReadyState?: DocumentReadyState;
}

const loadDataRegistry = async (): Promise<void> => {
  const { initializeDataRegistry } = await import('@/data/DataRegistry');
  await initializeDataRegistry();
};

const getBrowserWindow = (): WarmupWindowLike | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const getDocumentReadyState = (): DocumentReadyState | undefined => (
  typeof document === 'undefined' ? undefined : document.readyState
);

/** Schedules non-critical registry initialization without delaying first paint. */
export const scheduleDataRegistryWarmup = ({
  loadDataRegistry: load = loadDataRegistry,
  logFailure = logDataRegistryBootstrapFailure,
  windowLike: configuredWindow,
  documentReadyState = getDocumentReadyState(),
}: DataRegistryWarmupOptions = {}): void => {
  const windowLike = configuredWindow === undefined ? getBrowserWindow() : configuredWindow ?? undefined;
  const run = () => {
    void load().catch(logFailure);
  };

  if (!windowLike) {
    run();
    return;
  }

  const scheduleIdleWork = () => {
    if (windowLike.requestIdleCallback) {
      windowLike.requestIdleCallback(run, { timeout: DATA_REGISTRY_IDLE_TIMEOUT_MS });
      return;
    }
    windowLike.setTimeout(run, 5_000);
  };

  const scheduleAfterPaint = () => {
    windowLike.setTimeout(scheduleIdleWork, DATA_REGISTRY_BACKGROUND_WARMUP_DELAY_MS);
  };

  if (documentReadyState === 'complete') {
    scheduleAfterPaint();
    return;
  }

  windowLike.addEventListener?.('load', scheduleAfterPaint, { once: true });
};

/** Initializes process-wide browser concerns before React mounts. */
export const initializeApplicationRuntime = (): (() => void) => {
  initDevConsoleFilters();
  const cleanupGlobalErrorHandling = initGlobalErrorHandling();
  performanceMonitor.start();
  scheduleDataRegistryWarmup();

  return () => {
    cleanupGlobalErrorHandling();
    performanceMonitor.stop();
  };
};
