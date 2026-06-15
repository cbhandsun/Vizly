import { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { ContextMenuProps } from '../DiagramContextMenu';
import { useDiagramStore } from '../../../store/useDiagramStore';

interface UseDesignerContextMenuOptions {
    reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
    selectedNodes: Node[];
}

/**
 * 右键菜单定位与事件处理
 * 状态存储在 Zustand
 */
export function useDesignerContextMenu({
    reactFlowWrapper,
    selectedNodes,
}: UseDesignerContextMenuOptions) {
    const setContextMenu = useDiagramStore(state => state.setContextMenu);

    const openContextMenu = useCallback((args: { clientX: number; clientY: number; type: ContextMenuProps['type']; targetId?: string }) => {
        const el = reactFlowWrapper.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const menuWidth = 220;
        const menuHeight = 280;
        const padding = 8;
        const rawLeft = args.clientX - rect.left;
        const rawTop = args.clientY - rect.top;
        const left = Math.max(padding, Math.min(rawLeft, rect.width - menuWidth - padding));
        const top = Math.max(padding, Math.min(rawTop, rect.height - menuHeight - padding));

        setContextMenu({
            top,
            left,
            type: args.type,
            targetId: args.targetId,
        });
    }, [reactFlowWrapper, setContextMenu]);

    const onNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu({
                clientX: event.clientX,
                clientY: event.clientY,
                type: selectedNodes.length > 1 && selectedNodes.some(n => n.id === node.id) ? 'multi-node' : 'node',
                targetId: node.id,
            });
        },
        [openContextMenu, selectedNodes]
    );

    const onEdgeContextMenu = useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu({
                clientX: event.clientX,
                clientY: event.clientY,
                type: 'edge',
                targetId: edge.id,
            });
        },
        [openContextMenu]
    );

    const onPaneContextMenu = useCallback(
        (event: React.MouseEvent | MouseEvent) => {
            event.preventDefault();
            if ('stopPropagation' in event) event.stopPropagation();
            openContextMenu({
                clientX: event.clientX,
                clientY: event.clientY,
                type: 'pane',
            });
        },
        [openContextMenu]
    );

    const onPaneClick = useCallback(() => setContextMenu(null), [setContextMenu]);

    return {
        onNodeContextMenu,
        onEdgeContextMenu,
        onPaneContextMenu,
        onPaneClick,
    };
}
