import { createContext, useContext } from 'react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

export interface MindElixirContextValue {
    instance: MindElixirInstance | null;
    selectedNode: NodeObj | null;
}

export const MindElixirContext = createContext<MindElixirContextValue>({
    instance: null,
    selectedNode: null,
});

export function useMindElixir() {
    return useContext(MindElixirContext);
}
