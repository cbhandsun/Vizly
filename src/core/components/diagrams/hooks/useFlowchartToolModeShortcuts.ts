import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';

interface FlowchartToolModeShortcutsOptions {
    editingEnabled: boolean;
    isDrawingMode: boolean;
    isMarqueeActive: boolean;
    setIsDrawingMode: Dispatch<SetStateAction<boolean>>;
    setIsMarqueeActive: Dispatch<SetStateAction<boolean>>;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};

export const useFlowchartToolModeShortcuts = ({
    editingEnabled,
    isDrawingMode,
    isMarqueeActive,
    setIsDrawingMode,
    setIsMarqueeActive,
}: FlowchartToolModeShortcutsOptions) => {
    const activatePointer = useCallback(() => {
        setIsDrawingMode(false);
        setIsMarqueeActive(false);
    }, [setIsDrawingMode, setIsMarqueeActive]);

    const toggleDrawingMode = useCallback(() => {
        if (!editingEnabled) return;
        setIsDrawingMode(active => !active);
        setIsMarqueeActive(false);
    }, [editingEnabled, setIsDrawingMode, setIsMarqueeActive]);

    const toggleMarqueeMode = useCallback(() => {
        if (!editingEnabled) return;
        setIsMarqueeActive(active => !active);
        setIsDrawingMode(false);
    }, [editingEnabled, setIsDrawingMode, setIsMarqueeActive]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!editingEnabled || isEditableTarget(event.target)) return;
            if (event.key === 'Escape' && (isDrawingMode || isMarqueeActive)) {
                event.preventDefault();
                activatePointer();
                return;
            }
            if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'p') {
                event.preventDefault();
                toggleDrawingMode();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activatePointer, editingEnabled, isDrawingMode, isMarqueeActive, toggleDrawingMode]);

    return { activatePointer, toggleDrawingMode, toggleMarqueeMode };
};
