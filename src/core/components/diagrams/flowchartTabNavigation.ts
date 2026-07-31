interface FlowchartTabNavigationCandidate {
    key: string;
    target: EventTarget | null;
    activeElement: Element | null;
}

const isEditableTarget = (target: HTMLElement): boolean => (
    target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
    || target.isContentEditable
);

/**
 * Only the canvas root/pane may opt into custom node cycling.
 * Focused nodes, edges, menus, and toolbar controls keep native Tab order.
 */
export const shouldHandleFlowchartCanvasTab = ({
    key,
    target,
    activeElement,
}: FlowchartTabNavigationCandidate): boolean => {
    if (key !== 'Tab' || !(target instanceof HTMLElement) || isEditableTarget(target)) {
        return false;
    }
    const canvas = target.closest('.react-flow');
    if (!canvas || (activeElement && !canvas.contains(activeElement))) {
        return false;
    }
    return target === canvas || target.classList.contains('react-flow__pane');
};

export const focusFlowchartNodeById = (
    root: ParentNode,
    nodeId: string,
): boolean => {
    if (!nodeId || nodeId.length > 1_024) return false;
    const node = Array.from(
        root.querySelectorAll<HTMLElement>('.react-flow__node[data-id]'),
    ).find(candidate => candidate.dataset.id === nodeId);
    if (!node) return false;
    node.focus({ preventScroll: true });
    return true;
};
