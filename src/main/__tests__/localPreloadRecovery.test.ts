import { describe, expect, it, vi } from 'vitest';
import { isCommandPalettePreloadFailure, loadWithLocalPreloadRecovery } from '../localPreloadRecovery';
import { installVitePreloadErrorRecovery, type PreloadRecoveryRuntime } from '../preloadErrorRecovery';

const origin = 'http://127.0.0.1:5419';
const commandFailure = () => new Error(`Failed to fetch dynamically imported module: ${origin}/assets/CommandPalette-test123.js`);
const emit = (target: EventTarget, payload: unknown) => {
  const event = new Event('vite:preloadError', { cancelable: true });
  Object.defineProperty(event, 'payload', { value: payload });
  target.dispatchEvent(event);
  return event;
};
const createRuntime = (): PreloadRecoveryRuntime => {
  const values = new Map<string, string>();
  return { target: document.createElement('div'),
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } },
    reload: vi.fn(), now: () => 1_800_000_000_000, setTimer: vi.fn(() => 1), clearTimer: vi.fn() };
};

describe('local optional preload ownership', () => {
  it('owns only known same-origin hashed command assets', () => {
    expect(isCommandPalettePreloadFailure(commandFailure(), origin)).toBe(true);
    expect(isCommandPalettePreloadFailure(new Error('Unable to preload CSS for /assets/editor-ui-ab_12.css'), origin)).toBe(true);
    for (const input of [null, {}, '', new Error(''), new Error('x'.repeat(4097)),
      new Error('Failed to fetch dynamically imported module: https://other.test/assets/CommandPalette-a.js'),
      new Error(`Failed to fetch dynamically imported module: ${origin}/assets/CommandPalette-a.js?secret=value`),
      new Error(`Failed to fetch dynamically imported module: ${origin}/assets/CommandPalette-a.js#hash`),
      new Error(`Failed to fetch dynamically imported module: ${origin}/assets/FlowchartDesigner-a.js`),
      new Error('Failed to fetch dynamically imported module: http://user:pass@127.0.0.1:5419/assets/CommandPalette-a.js'),
    ]) expect(isCommandPalettePreloadFailure(input, origin)).toBe(false);
    const unsafe = new Error();
    Object.defineProperty(unsafe, 'message', { get() { throw new Error('Unsafe getter'); } });
    expect(isCommandPalettePreloadFailure(unsafe, origin)).toBe(false);
    expect(isCommandPalettePreloadFailure(commandFailure(), 'not a URL')).toBe(false);
  });

  it('preserves a successful load and removes the ownership listener', async () => {
    const runtime = createRuntime();
    const dispose = installVitePreloadErrorRecovery(runtime);
    expect(await loadWithLocalPreloadRecovery(async () => 42, () => true, runtime.target)).toBe(42);
    const event = emit(runtime.target, commandFailure());
    expect(event.defaultPrevented).toBe(true);
    expect(runtime.reload).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('routes an owned failure to the caller without reload or swallowing its rejection', async () => {
    const runtime = createRuntime();
    const dispose = installVitePreloadErrorRecovery(runtime);
    const failure = commandFailure();
    await expect(loadWithLocalPreloadRecovery(async () => {
      const event = emit(runtime.target, failure);
      expect(event.defaultPrevented).toBe(false);
      throw failure;
    }, payload => isCommandPalettePreloadFailure(payload, origin), runtime.target)).rejects.toBe(failure);
    expect(runtime.reload).not.toHaveBeenCalled();
    // A later unrelated attempt retains the original global recovery.
    expect(emit(runtime.target, failure).defaultPrevented).toBe(true);
    expect(runtime.reload).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('does not claim simultaneous unrelated failures or unsafe payloads', async () => {
    const runtime = createRuntime();
    const dispose = installVitePreloadErrorRecovery(runtime);
    await loadWithLocalPreloadRecovery(async () => {
      expect(emit(runtime.target, new Error(`Failed to fetch dynamically imported module: ${origin}/assets/index-a.js`)).defaultPrevented).toBe(true);
      expect(emit(runtime.target, {}).defaultPrevented).toBe(true);
    }, payload => isCommandPalettePreloadFailure(payload, origin), runtime.target);
    expect(runtime.reload).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('cleans up after synchronous loader failure and leaves throwing matchers fail-closed', async () => {
    const runtime = createRuntime();
    const dispose = installVitePreloadErrorRecovery(runtime);
    await expect(loadWithLocalPreloadRecovery(() => { throw new Error('Synchronous load failure'); }, () => true, runtime.target)).rejects.toThrow('Synchronous load failure');
    await loadWithLocalPreloadRecovery(async () => {
      expect(emit(runtime.target, commandFailure()).defaultPrevented).toBe(true);
    }, () => { throw new Error('Matcher failed'); }, runtime.target);
    expect(runtime.reload).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('retains a concurrent owner after another call with the same matcher settles', async () => {
    const runtime = createRuntime();
    const dispose = installVitePreloadErrorRecovery(runtime);
    const owns = (payload: unknown) => isCommandPalettePreloadFailure(payload, origin);
    let complete: () => void = () => { throw new Error('No pending load'); };
    const pending = loadWithLocalPreloadRecovery(() => new Promise<void>(resolve => { complete = resolve; }), owns, runtime.target);
    await loadWithLocalPreloadRecovery(async () => undefined, owns, runtime.target);
    expect(emit(runtime.target, commandFailure()).defaultPrevented).toBe(false);
    expect(runtime.reload).not.toHaveBeenCalled();
    complete();
    await pending;
    expect(emit(runtime.target, commandFailure()).defaultPrevented).toBe(true);
    expect(runtime.reload).toHaveBeenCalledTimes(1);
    dispose();
  });
});
