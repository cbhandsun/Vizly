import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';

interface FlowchartToolModeShortcutsOptions {
    editingEnabled: boolean;
    isDrawingMode: boolean;
    isMarqueeActive: boolean;
    isCommentMode: boolean;
    setIsDrawingMode: Dispatch<SetStateAction<boolean>>;
    setIsMarqueeActive: Dispatch<SetStateAction<boolean>>;
    setIsCommentMode: (enabled: boolean) => void;
    onAddStickyNote?: () => void;
    onAddMindMap?: () => void;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};

export const useFlowchartToolModeShortcuts = ({
    editingEnabled,
    isDrawingMode,
    isMarqueeActive,
    isCommentMode,
    setIsDrawingMode,
    setIsMarqueeActive,
    setIsCommentMode,
    onAddStickyNote,
    onAddMindMap,
}: FlowchartToolModeShortcutsOptions) => {
    const activatePointer = useCallback(() => {
        setIsDrawingMode(false);
        setIsMarqueeActive(false);
        setIsCommentMode(false);
    }, [setIsCommentMode, setIsDrawingMode, setIsMarqueeActive]);

    const toggleDrawingMode = useCallback(() => {
        if (!editingEnabled) return;
        setIsDrawingMode(!isDrawingMode);
        setIsMarqueeActive(false);
        setIsCommentMode(false);
    }, [editingEnabled, isDrawingMode, setIsCommentMode, setIsDrawingMode, setIsMarqueeActive]);

    const toggleMarqueeMode = useCallback(() => {
        if (!editingEnabled) return;
        setIsMarqueeActive(!isMarqueeActive);
        setIsDrawingMode(false);
        setIsCommentMode(false);
    }, [editingEnabled, isMarqueeActive, setIsCommentMode, setIsDrawingMode, setIsMarqueeActive]);

    const setCommentMode = useCallback((enabled: boolean) => {
        if (enabled && !editingEnabled) return;
        if (enabled) {
            setIsDrawingMode(false);
            setIsMarqueeActive(false);
        }
        setIsCommentMode(enabled);
    }, [editingEnabled, setIsCommentMode, setIsDrawingMode, setIsMarqueeActive]);

    const toggleCommentMode = useCallback(() => {
        setCommentMode(!isCommentMode);
    }, [isCommentMode, setCommentMode]);

    useEffect(() => {
        if (!editingEnabled) {
            if (isDrawingMode || isMarqueeActive || isCommentMode) activatePointer();
            return;
        }
        if (isCommentMode && (isDrawingMode || isMarqueeActive)) {
            setIsDrawingMode(false);
            setIsMarqueeActive(false);
        }
    }, [
        activatePointer,
        editingEnabled,
        isCommentMode,
        isDrawingMode,
        isMarqueeActive,
        setIsDrawingMode,
        setIsMarqueeActive,
    ]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!editingEnabled || isEditableTarget(event.target)) return;
            if (event.key === 'Escape' && (isDrawingMode || isMarqueeActive || isCommentMode)) {
                event.preventDefault();
                activatePointer();
                return;
            }
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            const key = event.key.toLowerCase();
            if (event.shiftKey) {
                if (key === 'm' && onAddMindMap) {
                    event.preventDefault();
                    activatePointer();
                    onAddMindMap();
                }
                return;
            }

            const action = {
                v: activatePointer,
                m: toggleMarqueeMode,
                p: toggleDrawingMode,
                c: toggleCommentMode,
                ...(onAddStickyNote ? {
                    s: () => {
                        activatePointer();
                        onAddStickyNote();
                    },
                } : {}),
            }[key];
            if (action) {
                event.preventDefault();
                action();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activatePointer,
        editingEnabled,
        isCommentMode,
        isDrawingMode,
        isMarqueeActive,
        onAddMindMap,
        onAddStickyNote,
        toggleCommentMode,
        toggleDrawingMode,
        toggleMarqueeMode,
    ]);

    return { activatePointer, setCommentMode, toggleCommentMode, toggleDrawingMode, toggleMarqueeMode };
};
