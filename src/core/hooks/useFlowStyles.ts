import { useDiagramStylePreset_v2 } from './useDiagramStylePreset_v2';
import { getFlowStylesForPreset } from '../components/shared/flowStyles';

/**
 * Hook to access current flow styles based on the diagram preset.
 * Moved to a dedicated hook file to prevent circular dependencies with the style manager.
 */
export function useFlowStyles() {
    const preset = useDiagramStylePreset_v2();
    return getFlowStylesForPreset(preset);
}
