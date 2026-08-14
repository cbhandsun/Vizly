import { useCallback, useSyncExternalStore } from 'react';
import type { MindElixirInstance } from 'mind-elixir';

import { cleanAndValidateTree } from './mindmapTreeSanitizer';
import { hasMindMapTreeExpansionChange } from './mindmapTreeExpansion';

export interface MindMapTreeExpansionAvailability {
    canCollapse: boolean;
    canExpand: boolean;
}

const NONE = 0;
const COLLAPSE = 1;
const EXPAND = 2;

const AVAILABILITY_BY_MASK: ReadonlyArray<MindMapTreeExpansionAvailability> = Object.freeze([
    Object.freeze({ canCollapse: false, canExpand: false }),
    Object.freeze({ canCollapse: true, canExpand: false }),
    Object.freeze({ canCollapse: false, canExpand: true }),
    Object.freeze({ canCollapse: true, canExpand: true }),
]);

const getAvailabilityMask = (mind: MindElixirInstance | null): number => {
    if (!mind) return NONE;
    try {
        const root = cleanAndValidateTree(mind.getData().nodeData, true);
        const canCollapse = hasMindMapTreeExpansionChange(root, false);
        const canExpand = hasMindMapTreeExpansionChange(root, true);
        return (canCollapse ? COLLAPSE : NONE) | (canExpand ? EXPAND : NONE);
    } catch {
        return NONE;
    }
};

export const getMindMapTreeExpansionAvailability = (
    mind: MindElixirInstance | null,
): MindMapTreeExpansionAvailability => (
    AVAILABILITY_BY_MASK[getAvailabilityMask(mind)] ?? AVAILABILITY_BY_MASK[NONE]
);

export const useMindMapTreeExpansionAvailability = (
    mind: MindElixirInstance | null,
): MindMapTreeExpansionAvailability => {
    const subscribe = useCallback((listener: () => void) => {
        if (!mind) return () => undefined;
        const handleTreeChange = (): void => listener();
        mind.bus.addListener('operation', handleTreeChange);
        mind.bus.addListener('expandNode', handleTreeChange);
        return () => {
            mind.bus.removeListener('operation', handleTreeChange);
            mind.bus.removeListener('expandNode', handleTreeChange);
        };
    }, [mind]);
    const getSnapshot = useCallback(() => getAvailabilityMask(mind), [mind]);
    const mask = useSyncExternalStore(subscribe, getSnapshot, () => NONE);
    return AVAILABILITY_BY_MASK[mask] ?? AVAILABILITY_BY_MASK[NONE];
};
