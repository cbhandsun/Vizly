import { useCallback, useState } from 'react';

export interface MindMapFocusInstance<TNode = Element> {
    cancelFocus?: () => void;
    currentNode?: TNode | null;
    findEle: (nodeId: string) => TNode | null;
    focusNode?: (node: TNode) => void;
    getData: () => { nodeData: { id: string } };
}

export const useMindMapFocusMode = <TNode,>(mind: MindMapFocusInstance<TNode> | null) => {
    const [focusedMind, setFocusedMind] = useState<MindMapFocusInstance<TNode> | null>(null);
    const isFocused = mind !== null && focusedMind === mind;

    const toggleFocusMode = useCallback(() => {
        if (!mind) return;

        if (isFocused) {
            mind.cancelFocus?.();
            setFocusedMind(null);
            return;
        }

        const target = mind.currentNode ?? mind.findEle(mind.getData().nodeData.id);
        if (!target || !mind.focusNode) return;

        mind.focusNode(target);
        setFocusedMind(mind);
    }, [isFocused, mind]);

    return { isFocused, toggleFocusMode };
};
