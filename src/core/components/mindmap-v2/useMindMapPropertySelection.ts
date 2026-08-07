import { useSyncExternalStore } from 'react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { resolveSelectedMindMapNode } from './mindMapPropertySelection';
import {
    getActiveMindMapSelection,
    subscribeActiveMindMapSelection,
} from './mindMapSelectionStore';

export function useMindMapPropertySelection(mind: MindElixirInstance | null): NodeObj | null {
    const selectedNode = useSyncExternalStore(
        subscribeActiveMindMapSelection,
        getActiveMindMapSelection,
        getActiveMindMapSelection,
    );
    return selectedNode ?? (mind ? resolveSelectedMindMapNode(mind) : null);
}
