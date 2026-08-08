const PRELOAD_RECOVERY_STORAGE_KEY = 'vizly:preload-error-recovery';
const PRELOAD_RECOVERY_TTL_MS = 60_000;

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PreloadRecoveryRuntime {
  target: EventTarget;
  storage: RecoveryStorage | null;
  reload: () => void;
  now: () => number;
  setTimer: (handler: () => void, delayMs: number) => number;
  clearTimer: (timer: number) => void;
}

type MarkerReadResult =
  | { state: 'active'; timestamp: number }
  | { state: 'absent' | 'invalid' | 'unavailable' };

const parseRecoveryTimestamp = (value: string | null, now: number): number | null => {
  if (value === null) return null;
  if (!/^\d{1,16}$/.test(value)) return null;

  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;

  const age = now - timestamp;
  if (age < 0 || age >= PRELOAD_RECOVERY_TTL_MS) return null;
  return timestamp;
};

const readMarker = (
  storage: RecoveryStorage | null,
  now: number,
): MarkerReadResult => {
  if (!storage) return { state: 'unavailable' };
  try {
    const value = storage.getItem(PRELOAD_RECOVERY_STORAGE_KEY);
    if (value === null) return { state: 'absent' };
    const timestamp = parseRecoveryTimestamp(value, now);
    return timestamp === null
      ? { state: 'invalid' }
      : { state: 'active', timestamp };
  } catch {
    return { state: 'unavailable' };
  }
};

const removeMarker = (storage: RecoveryStorage | null): void => {
  if (!storage) return;
  try {
    storage.removeItem(PRELOAD_RECOVERY_STORAGE_KEY);
  } catch {
    // Storage can be disabled by browser policy. Recovery safely falls back to the app error boundary.
  }
};

const writeVerifiedMarker = (storage: RecoveryStorage | null, value: string): boolean => {
  if (!storage) return false;
  try {
    storage.setItem(PRELOAD_RECOVERY_STORAGE_KEY, value);
    return storage.getItem(PRELOAD_RECOVERY_STORAGE_KEY) === value;
  } catch {
    return false;
  }
};

export const createBrowserPreloadRecoveryRuntime = (
  windowRef: Window,
): PreloadRecoveryRuntime => {
  let storage: RecoveryStorage | null = null;
  try {
    storage = windowRef.sessionStorage;
  } catch {
    // Access itself can throw in restricted browser contexts.
  }

  return {
    target: windowRef,
    storage,
    reload: () => windowRef.location.reload(),
    now: () => Date.now(),
    setTimer: (handler, delayMs) => windowRef.setTimeout(handler, delayMs),
    clearTimer: timer => windowRef.clearTimeout(timer),
  };
};

/**
 * Recovers once from a Vite dynamic-import failure caused by a replaced deployment.
 * A verified session marker prevents reload loops; unsafe storage falls back to the existing error UI.
 */
export const installVitePreloadErrorRecovery = (
  runtime: PreloadRecoveryRuntime = createBrowserPreloadRecoveryRuntime(window),
): (() => void) => {
  let markerTimer: number | null = null;
  let disposed = false;

  const scheduleMarkerRemoval = (timestamp: number): void => {
    if (markerTimer !== null) runtime.clearTimer(markerTimer);
    const remaining = Math.max(
      0,
      PRELOAD_RECOVERY_TTL_MS - (runtime.now() - timestamp),
    );
    markerTimer = runtime.setTimer(() => {
      markerTimer = null;
      removeMarker(runtime.storage);
    }, remaining);
  };

  const initialMarker = readMarker(runtime.storage, runtime.now());
  if (initialMarker.state === 'active') {
    scheduleMarkerRemoval(initialMarker.timestamp);
  } else if (initialMarker.state === 'invalid') {
    removeMarker(runtime.storage);
  }

  const handlePreloadError = (event: Event): void => {
    event.preventDefault();
    if (disposed) return;

    const now = runtime.now();
    const marker = readMarker(runtime.storage, now);
    if (marker.state === 'active' || marker.state === 'unavailable') return;
    if (marker.state === 'invalid') removeMarker(runtime.storage);

    const markerValue = String(now);
    if (!writeVerifiedMarker(runtime.storage, markerValue)) return;
    scheduleMarkerRemoval(now);

    try {
      runtime.reload();
    } catch {
      if (markerTimer !== null) {
        runtime.clearTimer(markerTimer);
        markerTimer = null;
      }
      removeMarker(runtime.storage);
    }
  };

  runtime.target.addEventListener('vite:preloadError', handlePreloadError);

  return () => {
    disposed = true;
    runtime.target.removeEventListener('vite:preloadError', handlePreloadError);
    if (markerTimer !== null) runtime.clearTimer(markerTimer);
  };
};
