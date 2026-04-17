import { useCallback } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { PluginContext, DiagramTypePlugin } from '../../../types/plugin';

interface UseDiagramActionsProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance | null;
    pluginCtx?: PluginContext;
    activePlugin?: DiagramTypePlugin | null;
}

export const useDiagramActions = ({
    nodes,
    edges,
    setNodes,
    setEdges,
    selectedNodes,
    selectedEdges,
    takeSnapshot,
    reactFlowInstance,
    pluginCtx,
    activePlugin
}: UseDiagramActionsProps) => {

    const handleDelete = useCallback(async (targetId?: string) => {
        // Determine what to delete
        let nodeIdsToDelete = new Set<string>();
        let edgeIdsToDelete = new Set<string>();

        if (targetId) {
            // Context menu action on a specific element
            const isNode = nodes.some(n => n.id === targetId);
            const isEdge = edges.some(e => e.id === targetId);

            if (isNode) {
                // If the target is part of selection, delete all selected. Otherwise just target.
                if (selectedNodes.some(n => n.id === targetId)) {
                    nodeIdsToDelete = new Set(selectedNodes.map(n => n.id));
                } else {
                    nodeIdsToDelete.add(targetId);
                }
            } else if (isEdge) {
                edgeIdsToDelete.add(targetId);
            }
        } else {
            // General delete action (e.g. keyboard), delete selection
            nodeIdsToDelete = new Set(selectedNodes.map(n => n.id));
            edgeIdsToDelete = new Set(selectedEdges.map(e => e.id));
        }

        if (nodeIdsToDelete.size > 0 || edgeIdsToDelete.size > 0) {
            // [DDD] MindMap Cascading Deletion: if a mindmap node is deleted, delete its subtree
            const mindMapNodes = nodes.filter(n => nodeIdsToDelete.has(n.id) && n.type === 'mindmap');
            if (mindMapNodes.length > 0) {
                const visited = new Set<string>(nodeIdsToDelete);
                const getDescendants = (parentId: string) => {
                    const childrenIds = edges
                        .filter(e => e.source === parentId && e.type !== 'relationshipEdge')
                        .map(e => e.target);
                    for (const cid of childrenIds) {
                        if (!visited.has(cid)) {
                            visited.add(cid);
                            nodeIdsToDelete.add(cid);
                            getDescendants(cid);
                        }
                    }
                };
                mindMapNodes.forEach(rn => getDescendants(rn.id));
            }

            // 拦截器：允许插件否决删除操作
            if (activePlugin && pluginCtx) {
                if (nodeIdsToDelete.size > 0 && activePlugin.onBeforeNodesDelete) {
                    const nodesToDelete = nodes.filter(n => nodeIdsToDelete.has(n.id));
                    const allowDelete = await activePlugin.onBeforeNodesDelete(nodesToDelete, pluginCtx);
                    if (!allowDelete) nodeIdsToDelete.clear();
                }
                
                if (edgeIdsToDelete.size > 0 && activePlugin.onBeforeEdgesDelete) {
                    const edgesToDelete = edges.filter(e => edgeIdsToDelete.has(e.id));
                    const allowDelete = await activePlugin.onBeforeEdgesDelete(edgesToDelete, pluginCtx);
                    if (!allowDelete) edgeIdsToDelete.clear();
                }
            }

            if (nodeIdsToDelete.size === 0 && edgeIdsToDelete.size === 0) return;

            takeSnapshot(nodes, edges);
            setNodes(nds => nds.filter(n => !nodeIdsToDelete.has(n.id)));
            setEdges(eds => eds.filter(e =>
                !edgeIdsToDelete.has(e.id) &&
                !nodeIdsToDelete.has(e.source) &&
                !nodeIdsToDelete.has(e.target)
            ));
        }
    }, [nodes, edges, selectedNodes, selectedEdges, setNodes, setEdges, takeSnapshot, activePlugin, pluginCtx]);

    const handleDuplicate = useCallback((targetId?: string) => {
        const nodesToDuplicate = targetId
            ? nodes.filter(n => n.id === targetId)
            : selectedNodes;

        if (nodesToDuplicate.length === 0) return;

        takeSnapshot(nodes, edges);

        const newNodes = nodesToDuplicate.map(node => ({
            ...node,
            id: `${node.type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            position: { x: node.position.x + 50, y: node.position.y + 50 },
            selected: true,
            data: { ...node.data, label: `${node.data.label || 'Node'} (Copy)` }
        }));

        // Deselect originals and add new ones
        setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes]);
    }, [nodes, edges, selectedNodes, setNodes, takeSnapshot]);

    const handleBringToFront = useCallback((targetId?: string) => {
        if (!targetId) return;
        takeSnapshot(nodes, edges);
        setNodes(nds => {
            const node = nds.find(n => n.id === targetId);
            if (!node) return nds;
            return [...nds.filter(n => n.id !== targetId), node];
        });
    }, [nodes, edges, setNodes, takeSnapshot]);

    const handleSendToBack = useCallback((targetId?: string) => {
        if (!targetId) return;
        takeSnapshot(nodes, edges);
        setNodes(nds => {
            const node = nds.find(n => n.id === targetId);
            if (!node) return nds;
            return [node, ...nds.filter(n => n.id !== targetId)];
        });
    }, [nodes, edges, setNodes, takeSnapshot]);

    const handleLock = useCallback((targetId?: string, locked: boolean = true) => {
        if (!targetId) return;
        takeSnapshot(nodes, edges);
        setNodes(nds => nds.map(n => {
            if (n.id === targetId) {
                return {
                    ...n,
                    draggable: !locked,
                    data: { ...n.data, locked }
                };
            }
            return n;
        }));
    }, [nodes, edges, setNodes, takeSnapshot]);

    const handleSelectAll = useCallback(() => {
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        setEdges(eds => eds.map(e => ({ ...e, selected: true })));
    }, [setNodes, setEdges]);

    const handleFitView = useCallback(() => {
        reactFlowInstance?.fitView();
    }, [reactFlowInstance]);

    // 反转连线方向
    const handleReverseEdge = useCallback((targetId?: string) => {
        if (!targetId) return;
        takeSnapshot(nodes, edges);
        setEdges(eds => eds.map(e => {
            if (e.id !== targetId) return e;
            return {
                ...e,
                source: e.target,
                target: e.source,
                sourceHandle: e.targetHandle,
                targetHandle: e.sourceHandle,
                data: { ...e.data, waypoints: [] }, // 反转后清除waypoints
            };
        }));
    }, [nodes, edges, setEdges, takeSnapshot]);

    // 重置路径（清除waypoints）
    const handleResetWaypoints = useCallback((targetId?: string) => {
        if (!targetId) return;
        takeSnapshot(nodes, edges);
        setEdges(eds => eds.map(e => {
            if (e.id !== targetId) return e;
            return {
                ...e,
                data: { ...e.data, waypoints: [] },
            };
        }));
    }, [nodes, edges, setEdges, takeSnapshot]);

    // 转为可编辑边
    const handleConvertToEditable = useCallback((targetId?: string) => {
        if (!targetId) return;
        takeSnapshot(nodes, edges);
        
        const updateFn = (e: Edge) => {
            if (e.id !== targetId) return e;
            return {
                ...e,
                type: 'editable',
                selected: true,
                data: { ...e.data, originalType: e.type || 'smart' },
            };
        };
        
        setEdges(eds => eds.map(updateFn));
        reactFlowInstance?.setEdges(eds => eds.map(updateFn));
    }, [nodes, edges, setEdges, takeSnapshot, reactFlowInstance]);

    // 退出编辑边
    const handleStopEditing = useCallback((targetId?: string) => {
        if (!targetId) return;
        takeSnapshot(nodes, edges);
        
        const updateFn = (e: Edge) => {
            if (e.id !== targetId) return e;
            const originalType = (e.data as any)?.originalType || 'smart';
            return {
                ...e,
                type: originalType,
                selected: false,
            };
        };

        setEdges(eds => eds.map(updateFn));
        reactFlowInstance?.setEdges(eds => eds.map(updateFn));
    }, [nodes, edges, setEdges, takeSnapshot, reactFlowInstance]);

    // 对齐选中节点
    const handleAlign = useCallback((type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        if (selectedNodes.length < 2) return;
        takeSnapshot(nodes, edges);

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        selectedNodes.forEach(n => {
            const w = n.measured?.width || n.width || 0;
            const h = n.measured?.height || n.height || 0;
            minX = Math.min(minX, n.position.x);
            maxX = Math.max(maxX, n.position.x + w);
            minY = Math.min(minY, n.position.y);
            maxY = Math.max(maxY, n.position.y + h);
        });
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const ids = new Set(selectedNodes.map(n => n.id));
        setNodes(nds => nds.map(n => {
            if (!ids.has(n.id)) return n;
            const w = n.measured?.width || n.width || 0;
            const h = n.measured?.height || n.height || 0;
            let newX = n.position.x, newY = n.position.y;
            switch (type) {
                case 'left': newX = minX; break;
                case 'center': newX = centerX - w / 2; break;
                case 'right': newX = maxX - w; break;
                case 'top': newY = minY; break;
                case 'middle': newY = centerY - h / 2; break;
                case 'bottom': newY = maxY - h; break;
            }
            return { ...n, position: { x: newX, y: newY } };
        }));
    }, [selectedNodes, nodes, edges, setNodes, takeSnapshot]);

    // 均匀分布选中节点
    const handleDistribute = useCallback((type: 'horizontal' | 'vertical') => {
        if (selectedNodes.length < 3) return;
        takeSnapshot(nodes, edges);

        const sorted = [...selectedNodes].sort((a, b) =>
            type === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y
        );
        const minPos = type === 'horizontal' ? sorted[0].position.x : sorted[0].position.y;
        const maxPos = type === 'horizontal' ? sorted[sorted.length - 1].position.x : sorted[sorted.length - 1].position.y;
        const step = (maxPos - minPos) / (sorted.length - 1);

        const posMap = new Map<string, number>();
        sorted.forEach((n, i) => posMap.set(n.id, minPos + step * i));

        setNodes(nds => nds.map(n => {
            if (!posMap.has(n.id)) return n;
            return {
                ...n,
                position: {
                    x: type === 'horizontal' ? posMap.get(n.id)! : n.position.x,
                    y: type === 'vertical' ? posMap.get(n.id)! : n.position.y,
                }
            };
        }));
    }, [selectedNodes, nodes, edges, setNodes, takeSnapshot]);

    // 统一选中节点尺寸（参照第一个选中节点）
    const handleMatchSize = useCallback((mode: 'width' | 'height' | 'both') => {
        if (selectedNodes.length < 2) return;
        const ref = selectedNodes[0];
        const refW = ref.measured?.width || ref.width || 150;
        const refH = ref.measured?.height || ref.height || 40;
        takeSnapshot(nodes, edges);

        const ids = new Set(selectedNodes.map(n => n.id));
        setNodes(nds => nds.map(n => {
            if (!ids.has(n.id) || n.id === ref.id) return n;
            return {
                ...n,
                width: (mode === 'width' || mode === 'both') ? refW : (n.width || undefined),
                height: (mode === 'height' || mode === 'both') ? refH : (n.height || undefined),
                style: {
                    ...n.style,
                    ...(mode === 'width' || mode === 'both' ? { width: refW } : {}),
                    ...(mode === 'height' || mode === 'both' ? { height: refH } : {}),
                }
            };
        }));
    }, [selectedNodes, nodes, edges, setNodes, takeSnapshot]);

    // Context Menu Dispatcher
    const onContextMenuAction = useCallback((action: string, targetId?: string) => {
        // 对齐操作
        if (action.startsWith('align:')) {
            handleAlign(action.replace('align:', '') as any);
            return;
        }
        // 分布操作
        if (action.startsWith('distribute:')) {
            handleDistribute(action.replace('distribute:', '') as any);
            return;
        }
        // 统一尺寸
        if (action === 'matchWidth') { handleMatchSize('width'); return; }
        if (action === 'matchHeight') { handleMatchSize('height'); return; }
        if (action === 'matchSize') { handleMatchSize('both'); return; }

        switch (action) {
            case 'delete':
                handleDelete(targetId);
                break;
            case 'duplicate':
                handleDuplicate(targetId);
                break;
            case 'bringToFront':
                handleBringToFront(targetId);
                break;
            case 'sendToBack':
                handleSendToBack(targetId);
                break;
            case 'fitView':
                handleFitView();
                break;
            case 'lock':
                handleLock(targetId, true);
                break;
            case 'unlock':
                handleLock(targetId, false);
                break;
            case 'reverseEdge':
                handleReverseEdge(targetId);
                break;
            case 'resetWaypoints':
                handleResetWaypoints(targetId);
                break;
            case 'convertToEditable':
                handleConvertToEditable(targetId);
                break;
            case 'stopEditing':
                handleStopEditing(targetId);
                break;
        }
    }, [handleDelete, handleDuplicate, handleBringToFront, handleSendToBack, handleFitView, handleLock, handleReverseEdge, handleResetWaypoints, handleConvertToEditable, handleStopEditing, handleAlign, handleDistribute, handleMatchSize]);

    return {
        handleDelete,
        handleDuplicate,
        handleSelectAll,
        handleFitView,
        handleBringToFront,
        handleSendToBack,
        onContextMenuAction,
        handleLock
    };
};
