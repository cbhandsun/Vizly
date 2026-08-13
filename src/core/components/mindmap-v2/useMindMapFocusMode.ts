import { useCallback, useEffect, useRef, useState } from 'react';

export interface MindMapFocusInstance<TNode = Element> {
    cancelFocus?: () => void;
    currentNode?: TNode | null;
    findEle: (nodeId: string) => TNode | null;
    focusNode?: (node: TNode) => void;
    getData: () => { nodeData: { id: string } };
}

export type MindMapFocusModeErrorReporter = (error: unknown) => void;

export const useMindMapFocusMode = <TNode,>(
    mind: MindMapFocusInstance<TNode> | null,
    reportError: MindMapFocusModeErrorReporter,
) => {
    const [focusedMind, setFocusedMind] = useState<MindMapFocusInstance<TNode> | null>(null);
    const focusedMindRef = useRef<MindMapFocusInstance<TNode> | null>(null);
    const reportErrorRef = useRef(reportError);
    const isFocused = mind !== null && focusedMind === mind;

    useEffect(() => {
        reportErrorRef.current = reportError;
    }, [reportError]);

    const cancelFocusedMind = useCallback((target: MindMapFocusInstance<TNode>) => {
        try {
            target.cancelFocus?.();
        } catch (error) {
            reportErrorRef.current(error);
        } finally {
            if (focusedMindRef.current === target) {
                focusedMindRef.current = null;
            }
        }
    }, []);

    useEffect(() => {
        const activeMind = focusedMindRef.current;
        if (!activeMind || activeMind === mind) return;

        cancelFocusedMind(activeMind);
        setFocusedMind(null);
    }, [cancelFocusedMind, mind]);

    useEffect(() => () => {
        const activeMind = focusedMindRef.current;
        if (activeMind) cancelFocusedMind(activeMind);
    }, [cancelFocusedMind]);

    const toggleFocusMode = useCallback(() => {
        if (!mind) return;

        const activeMind = focusedMindRef.current;
        if (activeMind === mind) {
            cancelFocusedMind(activeMind);
            setFocusedMind(null);
            return;
        }

        if (activeMind) cancelFocusedMind(activeMind);

        const target = mind.currentNode ?? mind.findEle(mind.getData().nodeData.id);
        if (!target || !mind.focusNode) return;

        mind.focusNode(target);
        focusedMindRef.current = mind;
        setFocusedMind(mind);
    }, [cancelFocusedMind, mind]);

    return { isFocused, toggleFocusMode };
};
