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

/**
 * Restores keyboard context to the canvas after a transient canvas surface
 * closes. React Flow's application root is programmatically focusable only
 * after it receives tabindex=-1. The negative value keeps it out of the normal
 * tab order while allowing focus to remain stable in real browsers.
 */
export const focusFlowchartCanvas = (root: ParentNode): boolean => {
    const canvas = root.querySelector<HTMLElement>('.react-flow[role="application"], .react-flow');
    if (!canvas) return false;

    if (!canvas.hasAttribute('tabindex')) {
        canvas.setAttribute('tabindex', '-1');
    }
    canvas.focus({ preventScroll: true });
    return canvas.ownerDocument.activeElement === canvas;
};

/**
 * Keeps pointer selection and keyboard context on the same edge. React Flow
 * selects SVG edges on click but browsers do not focus the SVG group by
 * default, so focus must be handed over explicitly after selection settles.
 */
export const focusFlowchartEdgeById = (
    root: ParentNode,
    edgeId: string,
): boolean => {
    if (!edgeId || edgeId.length > 1_024) return false;
    const edge = Array.from(
        root.querySelectorAll<HTMLElement>('.react-flow__edge[data-id]'),
    ).find(candidate => candidate.getAttribute('data-id') === edgeId);
    if (!edge) return false;
    edge.focus({ preventScroll: true });
    return edge.ownerDocument.activeElement === edge;
};

/**
 * Hands interaction context to a newly-created node after selection settles.
 * Prefer the selected semantic tree item so assistive technology receives the
 * node's selected state; fall back to React Flow's focusable node container.
 */
export const focusAddedFlowchartNodeById = (
    root: ParentNode,
    nodeId: string,
): boolean => {
    if (!nodeId || nodeId.length > 1_024) return false;
    const wrapper = Array.from(
        root.querySelectorAll<HTMLElement>('.react-flow__node[data-id]'),
    ).find(candidate => candidate.dataset.id === nodeId);
    if (!wrapper) return false;

    const selectedTreeItem = wrapper.querySelector<HTMLElement>(
        '[role="treeitem"][aria-selected="true"][tabindex]',
    );
    const target = selectedTreeItem ?? wrapper;
    target.focus({ preventScroll: true });
    return target.ownerDocument.activeElement === target;
};
