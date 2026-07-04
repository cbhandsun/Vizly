import type { Node, ReactFlowInstance } from '@xyflow/react';

export const scheduleFlowchartInitialFit = ({
    reactFlowInstance,
    delayMs = 250,
    dispatchFit,
}: {
    reactFlowInstance: Pick<ReactFlowInstance<Node, unknown>, 'getNodes'>;
    delayMs?: number;
    dispatchFit: () => void;
}): ReturnType<typeof setTimeout> => setTimeout(() => {
    if (reactFlowInstance.getNodes().length > 0) {
        dispatchFit();
    }
}, delayMs);
