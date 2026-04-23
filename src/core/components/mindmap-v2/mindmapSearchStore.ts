/**
 * mindmapSearchStore.ts
 * Tiny module-level event bus for opening/closing the MindMap search overlay.
 * Avoids prop-drilling between MindMapPlugin (Canvas) and MindElixirToolbar.
 */

type Listener = () => void;

let _openListeners: Listener[] = [];

export function subscribeSearchOpen(fn: Listener): () => void {
    _openListeners.push(fn);
    return () => { _openListeners = _openListeners.filter(l => l !== fn); };
}

export function emitOpenSearch(): void {
    _openListeners.forEach(fn => fn());
}
