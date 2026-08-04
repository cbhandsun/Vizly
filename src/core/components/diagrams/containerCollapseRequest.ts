export const CONTAINER_COLLAPSE_REQUEST_EVENT = 'vizly:container-collapse-request';

export const readContainerCollapseRequest = (event: Event): string | null => {
    if (!(event instanceof CustomEvent)) return null;
    const detail: unknown = event.detail;
    if (typeof detail !== 'object' || detail === null || !('nodeId' in detail)) return null;
    const nodeId = detail.nodeId;
    return typeof nodeId === 'string' && nodeId.trim().length > 0 ? nodeId : null;
};

export const dispatchContainerCollapseRequest = (target: HTMLElement, nodeId: string): void => {
    if (!nodeId) return;
    target.dispatchEvent(new CustomEvent(CONTAINER_COLLAPSE_REQUEST_EVENT, {
        bubbles: true,
        detail: { nodeId },
    }));
};
