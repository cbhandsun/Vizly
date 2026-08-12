import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Node, Edge } from '@xyflow/react';
import type { ContextMenuProps } from '../DiagramContextMenu';
import { resolveDiagramContextMenuPosition } from '../diagramContextMenuPlacement';
import { useDiagramStore } from '../../../store/useDiagramStore';
import {
    applyContextMenuVisualSelection,
    resolveContextMenuTargetSelection,
} from '../contextMenuTargetSelection';

interface UseDesignerContextMenuOptions {
    reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    setSelectedNodes: Dispatch<SetStateAction<Node[]>>;
    setSelectedEdges: Dispatch<SetStateAction<Edge[]>>;
}

/**
 * 右键菜单定位与事件处理
 * 状态存储在 Zustand
 */
export function useDesignerContextMenu({
    reactFlowWrapper,
    selectedNodes,
    selectedEdges,
    setNodes,
    setEdges,
    setSelectedNodes,
    setSelectedEdges,
}: UseDesignerContextMenuOptions) {
    const setContextMenu = useDiagramStore(state => state.setContextMenu);

    const alignContextMenuTargetSelection = useCallback((target: Node | Edge, targetType: 'node' | 'edge') => {
        const selection = resolveContextMenuTargetSelection({
            targetId: target.id,
            targetType,
            selectedNodeIds: selectedNodes.map(node => node.id),
        });
        const selectedNodeIds = new Set(selection.nodeIds);
        const selectedEdgeIds = new Set(selection.edgeIds);

        setNodes(currentNodes => applyContextMenuVisualSelection(currentNodes, selectedNodeIds));
        setEdges(currentEdges => applyContextMenuVisualSelection(currentEdges, selectedEdgeIds));
        setSelectedNodes(selection.nodeIds.map(id =>
            id === target.id && targetType === 'node'
                ? target as Node
                : selectedNodes.find(node => node.id === id),
        ).filter((node): node is Node => Boolean(node)));
        setSelectedEdges(selection.edgeIds.map(id =>
            id === target.id && targetType === 'edge'
                ? target as Edge
                : selectedEdges.find(edge => edge.id === id),
        ).filter((edge): edge is Edge => Boolean(edge)));
    }, [selectedEdges, selectedNodes, setEdges, setNodes, setSelectedEdges, setSelectedNodes]);

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
            alignContextMenuTargetSelection(node, 'node');
            openContextMenu({
                clientX: event.clientX,
                clientY: event.clientY,
                type: selectedNodes.length > 1 && selectedNodes.some(n => n.id === node.id) ? 'multi-node' : 'node',
                targetId: node.id,
            });
        },
        [alignContextMenuTargetSelection, openContextMenu, selectedNodes]
    );

    const onEdgeContextMenu = useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            event.preventDefault();
            event.stopPropagation();
            alignContextMenuTargetSelection(edge, 'edge');
            openContextMenu({
                clientX: event.clientX,
                clientY: event.clientY,
                type: 'edge',
                targetId: edge.id,
            });
        },
        [alignContextMenuTargetSelection, openContextMenu]
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
