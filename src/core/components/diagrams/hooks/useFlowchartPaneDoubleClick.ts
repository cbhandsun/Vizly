import { useCallback } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';

interface FlowchartPaneDoubleClickOptions {
    openQuickAddMenu: (x: number, y: number) => void;
    reactFlowInstance: ReactFlowInstance | null;
}

export const useFlowchartPaneDoubleClick = ({
    openQuickAddMenu,
    reactFlowInstance,
}: FlowchartPaneDoubleClickOptions) => useCallback((event: React.MouseEvent | MouseEvent) => {
    if (!reactFlowInstance) return;
    const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
    });
    openQuickAddMenu(position.x, position.y);
}, [openQuickAddMenu, reactFlowInstance]);
