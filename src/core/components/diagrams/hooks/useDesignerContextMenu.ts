import { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import type { ContextMenuProps } from '../DiagramContextMenu';
import { resolveDiagramContextMenuPosition } from '../diagramContextMenuPlacement';
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
        const position = resolveDiagramContextMenuPosition({
            clientX: args.clientX,
            clientY: args.clientY,
            bounds: rect,
            type: args.type,
        });

        setContextMenu({
            ...position,
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
