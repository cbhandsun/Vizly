import { useSyncExternalStore } from 'react';
import { diagramStyleManager, type FlowStylePreset } from '../components/shared/DiagramStyleManager';

/**
 * Hook to access the current diagram style preset.
 * Moved to a dedicated hook file to resolve circular dependencies and runtime resolution issues.
 */
export function useDiagramStylePreset_v2(): FlowStylePreset {
    return useSyncExternalStore(
        (callback) => diagramStyleManager.subscribe(callback),
        () => diagramStyleManager.getPreset()
    );
}
