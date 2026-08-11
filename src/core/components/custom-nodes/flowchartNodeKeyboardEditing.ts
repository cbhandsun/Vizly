export interface FlowchartNodeKeyboardEditingInput {
    key: unknown;
    editingAllowed: boolean;
    locked: boolean;
    isEditing: boolean;
    targetIsNode: boolean;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
}

export const shouldStartFlowchartNodeKeyboardEditing = ({
    key,
    editingAllowed,
    locked,
    isEditing,
    targetIsNode,
    altKey = false,
    ctrlKey = false,
    metaKey = false,
    shiftKey = false,
}: FlowchartNodeKeyboardEditingInput): boolean => {
    if (!editingAllowed || locked || isEditing || !targetIsNode) return false;
    if (altKey || ctrlKey || metaKey || shiftKey) return false;
    return key === 'Enter' || key === 'F2';
};
