import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  installVitePreloadErrorRecovery,
  type PreloadRecoveryRuntime,
} from '../preloadErrorRecovery';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const createRuntime = (
  overrides: Partial<PreloadRecoveryRuntime> = {},
): PreloadRecoveryRuntime => ({
  target: new EventTarget(),
  storage: new MemoryStorage(),
  reload: vi.fn(),
  now: () => 1_800_000_000_000,
  setTimer: vi.fn(() => 1),
  clearTimer: vi.fn(),
  ...overrides,
});

const dispatchPreloadError = (target: EventTarget): Event => {
  const event = new Event('vite:preloadError', { cancelable: true });
  Object.defineProperty(event, 'payload', {
    value: new Error('Authorization: Bearer private-chunk-secret'),
  });
  target.dispatchEvent(event);
  return event;
};

describe('Vite preload error recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses the stale chunk error and reloads exactly once per recovery window', () => {
    const runtime = createRuntime();
    const dispose = installVitePreloadErrorRecovery(runtime);

    const first = dispatchPreloadError(runtime.target);
    const second = dispatchPreloadError(runtime.target);

    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(true);
    expect(runtime.reload).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('does not reload again when the page starts inside the recovery window', () => {
    const storage = new MemoryStorage();
    storage.setItem('vizly:preload-error-recovery', '1799999999000');
    const runtime = createRuntime({ storage });
    const dispose = installVitePreloadErrorRecovery(runtime);

    dispatchPreloadError(runtime.target);

    expect(runtime.reload).not.toHaveBeenCalled();
    dispose();
  });

  it('removes an expired marker and allows a new recovery attempt', () => {
    const storage = new MemoryStorage();
    storage.setItem('vizly:preload-error-recovery', '1799999900000');
    const runtime = createRuntime({ storage });
    const dispose = installVitePreloadErrorRecovery(runtime);

    dispatchPreloadError(runtime.target);

    expect(runtime.reload).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('expires a new marker when reload does not unload the current page', () => {
    let expireMarker: (() => void) | undefined;
    const reload = vi.fn();
    const runtime = createRuntime({
      reload,
      setTimer: vi.fn(handler => {
        expireMarker = handler;
        return 1;
      }),
    });
    const dispose = installVitePreloadErrorRecovery(runtime);

    dispatchPreloadError(runtime.target);
    expireMarker?.();
    dispatchPreloadError(runtime.target);

    expect(reload).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('sanitizes malformed markers before attempting recovery', () => {
    const storage = new MemoryStorage();
    storage.setItem('vizly:preload-error-recovery', 'Infinity<script>');
    const runtime = createRuntime({ storage });
    const dispose = installVitePreloadErrorRecovery(runtime);

    dispatchPreloadError(runtime.target);

    expect(runtime.reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem('vizly:preload-error-recovery')).toBe('1800000000000');
    dispose();
  });

  it('falls back without a reload loop when session storage is unavailable', () => {
    const reload = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runtime = createRuntime({ storage: null, reload });
    const dispose = installVitePreloadErrorRecovery(runtime);

    const event = dispatchPreloadError(runtime.target);

    expect(event.defaultPrevented).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private-chunk-secret');
    dispose();
  });

  it('detaches the listener when the runtime is disposed', () => {
    const runtime = createRuntime();
    const dispose = installVitePreloadErrorRecovery(runtime);
    dispose();

    dispatchPreloadError(runtime.target);

    expect(runtime.reload).not.toHaveBeenCalled();
  });
});
