/**
 * mindElixirStore.ts — Module-level singleton for mind-elixir instance access
 *
 * Problem: MindElixirContext.Provider lives inside MindElixirWrapper (canvas area),
 * but MindElixirToolbar is rendered in TopActionButtons (header area) — outside the
 * canvas subtree. React context cannot cross this tree boundary.
 *
 * Solution: A simple module-level ref that MindElixirWrapper writes on mount/unmount,
 * and MindElixirToolbar (or any component) reads synchronously. No global state,
 * no Redux, no event emitters — just a plain module singleton.
 */

import type { MindElixirInstance } from 'mind-elixir';

let _activeInstance: MindElixirInstance | null = null;
const _listeners = new Set<() => void>();

/** Called by MindElixirWrapper when a new instance is initialized */
export function registerMindElixirInstance(instance: MindElixirInstance): void {
    _activeInstance = instance;
    _listeners.forEach(fn => fn());
}

/** Called by MindElixirWrapper on cleanup */
export function unregisterMindElixirInstance(): void {
    _activeInstance = null;
    _listeners.forEach(fn => fn());
}

/** Get the currently active mind-elixir instance (may be null) */
export function getMindElixirInstance(): MindElixirInstance | null {
    return _activeInstance;
}

/** Subscribe to instance changes (returns unsubscribe fn) */
export function subscribeMindElixir(fn: () => void): () => void {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}
