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

import type { MindElixirInstance, NodeObj } from 'mind-elixir';


let _activeInstance: MindElixirInstance | null = null;
type MindElixirListener = (instance: MindElixirInstance | null) => void;
const _listeners = new Set<MindElixirListener>();

/** Called by MindElixirWrapper when a new instance is initialized */
export function registerMindElixirInstance(instance: MindElixirInstance): void {
    if (_activeInstance === instance) return;
    _activeInstance = instance;
    _listeners.forEach(fn => fn(_activeInstance));
}

/** Called by MindElixirWrapper on cleanup */
export function unregisterMindElixirInstance(instance?: MindElixirInstance): void {
    if (instance && _activeInstance !== instance) return;
    if (_activeInstance === null) return;
    _activeInstance = null;
    _listeners.forEach(fn => fn(_activeInstance));
}

/** Get the currently active mind-elixir instance (may be null) */
export function getMindElixirInstance(): MindElixirInstance | null {
    return _activeInstance;
}

/** Subscribe to instance changes (returns unsubscribe fn) */
export function subscribeMindElixir(fn: MindElixirListener): () => void {
    _listeners.add(fn);
    fn(_activeInstance);
    return () => _listeners.delete(fn);
}

// ─── Presentation Global State ────────────────────────────────────────────────
let _isPresenting = false;
let _presentationNode: NodeObj | null = null;
const _presentationListeners = new Set<() => void>();

export function setPresentationState(isPresenting: boolean, node: NodeObj | null): void {
    _isPresenting = isPresenting;
    _presentationNode = node;
    _presentationListeners.forEach(fn => fn());
}

export function getPresentationState(): { isPresenting: boolean; presentationNode: NodeObj | null } {
    return { isPresenting: _isPresenting, presentationNode: _presentationNode };
}

export function subscribePresentation(fn: () => void): () => void {
    _presentationListeners.add(fn);
    return () => _presentationListeners.delete(fn);
}

// ─── Kanban Global State ──────────────────────────────────────────────────────
let _isKanbanOpen = false;
const _kanbanListeners = new Set<(open: boolean) => void>();

export function toggleKanban(open?: boolean): void {
    _isKanbanOpen = open !== undefined ? open : !_isKanbanOpen;
    _kanbanListeners.forEach(fn => fn(_isKanbanOpen));
    if (_isKanbanOpen && _isAIPanelOpen) {
        _isAIPanelOpen = false;
        _aiPanelListeners.forEach(fn => fn(_isAIPanelOpen));
    }
}

export function subscribeKanban(fn: (open: boolean) => void): () => void {
    _kanbanListeners.add(fn);
    return () => _kanbanListeners.delete(fn);
}

// ─── AI Assistant Global State ───────────────────────────────────────────────
let _isAIPanelOpen = false;
const _aiPanelListeners = new Set<(open: boolean) => void>();

export function toggleAIPanel(open?: boolean): void {
    _isAIPanelOpen = open !== undefined ? open : !_isAIPanelOpen;
    _aiPanelListeners.forEach(fn => fn(_isAIPanelOpen));
    if (_isAIPanelOpen && _isKanbanOpen) {
        _isKanbanOpen = false;
        _kanbanListeners.forEach(fn => fn(_isKanbanOpen));
    }
}

export function subscribeAIPanel(fn: (open: boolean) => void): () => void {
    _aiPanelListeners.add(fn);
    return () => _aiPanelListeners.delete(fn);
}


