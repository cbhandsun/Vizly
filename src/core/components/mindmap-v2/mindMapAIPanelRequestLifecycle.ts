export interface MindMapAIRequestLifecycle {
    begin: () => number;
    invalidate: () => void;
    isCurrent: (requestId: number) => boolean;
}

const nextRequestId = (currentId: number): number => (
    currentId >= Number.MAX_SAFE_INTEGER ? 1 : currentId + 1
);

export const createMindMapAIRequestLifecycle = (): MindMapAIRequestLifecycle => {
    let activeRequestId = 0;

    return {
        begin: () => {
            activeRequestId = nextRequestId(activeRequestId);
            return activeRequestId;
        },
        invalidate: () => {
            activeRequestId = nextRequestId(activeRequestId);
        },
        isCurrent: requestId => requestId === activeRequestId,
    };
};
