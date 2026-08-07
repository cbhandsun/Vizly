import type { NodeObj } from 'mind-elixir';

let selectedNode: NodeObj | null = null;
const listeners = new Set<() => void>();

export function getActiveMindMapSelection(): NodeObj | null {
    return selectedNode;
}

export function setActiveMindMapSelection(node: NodeObj | null): void {
    if (selectedNode === node) return;
    selectedNode = node;
    listeners.forEach(listener => listener());
}

export function subscribeActiveMindMapSelection(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
