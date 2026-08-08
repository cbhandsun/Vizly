import { useCallback } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { PluginContext, DiagramTypePlugin } from '../../../types/plugin';
import { useDiagramStore } from '../../../store/useDiagramStore';
import { hasMutationLockedNode, resolveTargetNodes } from '../nodeLockPolicy';
import {
    applyEdgeLockState,
    hasMutationLockedEdge,
} from '../edgeMutationPolicy';
import {
    convertDiagramEdgeToEditable,
    resetDiagramEdgeWaypoints,
    reverseDiagramEdge,
    stopEditingDiagramEdge,
    type EdgeMutationResult,
} from '../edgeContextMutations';
import { reorderNodesWithinParentScopes } from './nodeLayerOrdering';
import {
    EDITABLE_EDGE_TARGET_ZOOM,
    getEditableEdgeFocusCenter,
    shouldFocusEditableEdge,
} from '../edgeEditingViewport';
import { buildDiagramSelectionDuplicate } from '../diagramSelectionDuplication';

type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type DistributionType = 'horizontal' | 'vertical';
export type DiagramActionTarget = string | readonly string[];

const ALIGNMENT_TYPES = new Set<AlignmentType>(['left', 'center', 'right', 'top', 'middle', 'bottom']);
const DISTRIBUTION_TYPES = new Set<DistributionType>(['horizontal', 'vertical']);
const isAlignmentType = (value: string): value is AlignmentType => ALIGNMENT_TYPES.has(value as AlignmentType);
const isDistributionType = (value: string): value is DistributionType => DISTRIBUTION_TYPES.has(value as DistributionType);
const toTargetIds = (target: DiagramActionTarget): Set<string> => new Set(
    (typeof target === 'string' ? [target] : target)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
);

export const applyNodeLockState = (
    nodes: Node[],
    targetIds: ReadonlySet<string>,
    locked: boolean,
): { nodes: Node[]; changed: boolean } => {
    let changed = false;
    const nextNodes = nodes.map(node => {
        if (!targetIds.has(node.id)) return node;
        if (node.draggable === !locked && node.data?.locked === locked) return node;

        changed = true;
        return {
            ...node,
            draggable: !locked,
            data: { ...node.data, locked },
        };
    });

    return { nodes: changed ? nextNodes : nodes, changed };
};

interface UseDiagramActionsProps {
    nodes: Node[];
    edges: Edge[];
    nodesRef?: React.MutableRefObject<Node[]>;
    edgesRef?: React.MutableRefObject<Edge[]>;
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    takeSnapshot: (nodes: Node[], edges: Edge[], label?: string) => void;
    reactFlowInstance: DiagramReactFlowActions | null;
    pluginCtx?: PluginContext;
    activePlugin?: DiagramTypePlugin | null;
}

export type DiagramReactFlowActions = Pick<
    ReactFlowInstance,
    'fitView' | 'getViewport' | 'getInternalNode' | 'setCenter'
>;

export const useDiagramActions = ({
    nodes,
    edges,
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    selectedNodes,
    selectedEdges,
    takeSnapshot,
    reactFlowInstance,
    pluginCtx,
    activePlugin
}: UseDiagramActionsProps) => {
    const { t } = useTranslation();

    const handleDelete = useCallback(async (target?: DiagramActionTarget) => {
        // Determine what to delete
        let nodeIdsToDelete = new Set<string>();
        let edgeIdsToDelete = new Set<string>();
        const currentNodes = nodesRef?.current ?? nodes;
        const currentEdges = edgesRef?.current ?? edges;

        if (target && typeof target !== 'string') {
            const explicitIds = toTargetIds(target);
            nodeIdsToDelete = new Set(currentNodes.filter(node => explicitIds.has(node.id)).map(node => node.id));
            edgeIdsToDelete = new Set(currentEdges.filter(edge => explicitIds.has(edge.id)).map(edge => edge.id));
        } else if (target) {
            // Context menu action on a specific element
            const isNode = currentNodes.some(n => n.id === target);
            const isEdge = currentEdges.some(e => e.id === target);

            if (isNode) {
                // If the target is part of selection, delete all selected. Otherwise just target.
                if (selectedNodes.some(n => n.id === target)) {
                    nodeIdsToDelete = new Set(selectedNodes.map(n => n.id));
                } else {
                    nodeIdsToDelete.add(target);
                }
            } else if (isEdge) {
                edgeIdsToDelete.add(target);
            }
        } else {
            // General delete action (e.g. keyboard), delete selection
            nodeIdsToDelete = new Set(selectedNodes.map(n => n.id));
            edgeIdsToDelete = new Set(selectedEdges.map(e => e.id));
        }

        if (nodeIdsToDelete.size > 0 || edgeIdsToDelete.size > 0) {
            // [DDD] MindMap Cascading Deletion: if a mindmap node is deleted, delete its subtree
            const mindMapNodes = currentNodes.filter(n => nodeIdsToDelete.has(n.id) && n.type === 'mindmap');
            if (mindMapNodes.length > 0) {
                const visited = new Set<string>(nodeIdsToDelete);
                const getDescendants = (parentId: string) => {
                    const childrenIds = currentEdges
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

            // Cascading operations are all-or-nothing: protected descendants and
            // protected connectors that would disappear with a node block deletion.
            if (hasMutationLockedNode(resolveTargetNodes(currentNodes, nodeIdsToDelete))) return;
            const affectedEdges = currentEdges.filter(edge => (
                edgeIdsToDelete.has(edge.id)
                || nodeIdsToDelete.has(edge.source)
                || nodeIdsToDelete.has(edge.target)
            ));
            if (hasMutationLockedEdge(affectedEdges)) return;

            // 拦截器：允许插件否决删除操作
            if (activePlugin && pluginCtx) {
                if (nodeIdsToDelete.size > 0 && activePlugin.onBeforeNodesDelete) {
                    const nodesToDelete = currentNodes.filter(n => nodeIdsToDelete.has(n.id));
                    const allowDelete = await activePlugin.onBeforeNodesDelete(nodesToDelete, pluginCtx);
                    if (!allowDelete) nodeIdsToDelete.clear();
                }
                
                if (edgeIdsToDelete.size > 0 && activePlugin.onBeforeEdgesDelete) {
                    const edgesToDelete = currentEdges.filter(e => edgeIdsToDelete.has(e.id));
                    const allowDelete = await activePlugin.onBeforeEdgesDelete(edgesToDelete, pluginCtx);
                    if (!allowDelete) edgeIdsToDelete.clear();
                }
            }

            if (nodeIdsToDelete.size === 0 && edgeIdsToDelete.size === 0) return;

            takeSnapshot(currentNodes, currentEdges, t('designer.historyPanel.beforeDelete', {
                count: nodeIdsToDelete.size + edgeIdsToDelete.size,
            }));
            setNodes(nds => nds.filter(n => !nodeIdsToDelete.has(n.id)));
            setEdges(eds => eds.filter(e =>
                !edgeIdsToDelete.has(e.id) &&
                !nodeIdsToDelete.has(e.source) &&
                !nodeIdsToDelete.has(e.target)
            ));
        }
    }, [nodes, edges, nodesRef, edgesRef, selectedNodes, selectedEdges, setNodes, setEdges, takeSnapshot, activePlugin, pluginCtx, t]);

    const handleDuplicate = useCallback((target?: DiagramActionTarget) => {
        const currentNodes = nodesRef?.current ?? nodes;
        const currentEdges = edgesRef?.current ?? edges;
        const explicitIds = target ? toTargetIds(target) : null;
        const nodesToDuplicate = explicitIds
            ? currentNodes.filter(n => explicitIds.has(n.id))
            : selectedNodes;

        if (nodesToDuplicate.length === 0) return;
        if (hasMutationLockedNode(nodesToDuplicate)) return;

        takeSnapshot(currentNodes, currentEdges, t('designer.historyPanel.beforeDuplicate', {
            count: nodesToDuplicate.length,
        }));

        const targetIds = new Set(nodesToDuplicate.map(node => node.id));
        const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const duplicate = buildDiagramSelectionDuplicate({
            nodes: currentNodes,
            edges: currentEdges,
            targetIds,
            batchId,
            getDuplicateLabel: node => t('designer.flowchart.duplicateLabel', {
                    label: String(node.data.label || t('designer.flowchart.newNode', { defaultValue: 'Node' })),
                    defaultValue: '{{label}} (Copy)',
            }),
        });

        setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...duplicate.nodes]);
        setEdges(eds => [...eds.map(edge => ({ ...edge, selected: false })), ...duplicate.edges]);
    }, [nodes, edges, nodesRef, edgesRef, selectedNodes, setEdges, setNodes, takeSnapshot, t]);

    const handleBringToFront = useCallback((target?: DiagramActionTarget) => {
        const currentNodes = nodesRef?.current ?? nodes;
        const currentEdges = edgesRef?.current ?? edges;
        const targetIds = target
            ? toTargetIds(target)
            : new Set(selectedNodes.map(node => node.id));
        const targetNodes = resolveTargetNodes(currentNodes, targetIds);
        if (targetNodes.length === 0 || hasMutationLockedNode(targetNodes)) return;

        const result = reorderNodesWithinParentScopes(currentNodes, targetIds, 'front');
        if (!result.changed) return;
        takeSnapshot(currentNodes, currentEdges);
        if (nodesRef) nodesRef.current = result.nodes;
        setNodes(result.nodes);
    }, [nodes, edges, nodesRef, edgesRef, selectedNodes, setNodes, takeSnapshot]);

    const handleSendToBack = useCallback((target?: DiagramActionTarget) => {
        const currentNodes = nodesRef?.current ?? nodes;
        const currentEdges = edgesRef?.current ?? edges;
        const targetIds = target
            ? toTargetIds(target)
            : new Set(selectedNodes.map(node => node.id));
        const targetNodes = resolveTargetNodes(currentNodes, targetIds);
        if (targetNodes.length === 0 || hasMutationLockedNode(targetNodes)) return;

        const result = reorderNodesWithinParentScopes(currentNodes, targetIds, 'back');
        if (!result.changed) return;
        takeSnapshot(currentNodes, currentEdges);
        if (nodesRef) nodesRef.current = result.nodes;
        setNodes(result.nodes);
    }, [nodes, edges, nodesRef, edgesRef, selectedNodes, setNodes, takeSnapshot]);

    const handleLock = useCallback((target?: DiagramActionTarget, locked: boolean = true) => {
        const targetIds = target
            ? toTargetIds(target)
            : new Set([
                ...selectedNodes.map(node => node.id),
                ...selectedEdges.map(edge => edge.id),
            ]);
        if (targetIds.size === 0) return;
        const currentNodes = nodesRef?.current ?? nodes;
        const currentEdges = edgesRef?.current ?? edges;
        const nodeResult = applyNodeLockState(currentNodes, targetIds, locked);
        const edgeResult = applyEdgeLockState(currentEdges, targetIds, locked);
        if (!nodeResult.changed && !edgeResult.changed) return;

        takeSnapshot(currentNodes, currentEdges);
        if (nodeResult.changed) {
            if (nodesRef) nodesRef.current = nodeResult.nodes;
            setNodes(nodeResult.nodes);
        }
        if (edgeResult.changed) {
            if (edgesRef) edgesRef.current = edgeResult.edges;
            setEdges(edgeResult.edges);
        }

        const nodeById = new Map(nodeResult.nodes.map(node => [node.id, node]));
        const edgeById = new Map(edgeResult.edges.map(edge => [edge.id, edge]));
        const updateSelection = (items: Node[]) => items.map(node => nodeById.get(node.id) ?? node);
        const updateEdgeSelection = (items: Edge[]) => items.map(edge => edgeById.get(edge.id) ?? edge);
        const diagramStore = useDiagramStore.getState();
        diagramStore.setSelectedNodes(updateSelection(diagramStore.selectedNodes));
        diagramStore.setSelectedEdges(updateEdgeSelection(diagramStore.selectedEdges));
    }, [nodes, edges, nodesRef, edgesRef, selectedNodes, selectedEdges, setNodes, setEdges, takeSnapshot]);

    const handleSelectAll = useCallback(() => {
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        setEdges(eds => eds.map(e => ({ ...e, selected: true })));
    }, [setNodes, setEdges]);

    const handleFitView = useCallback(() => {
        reactFlowInstance?.fitView();
    }, [reactFlowInstance]);

    const commitEdgeMutation = useCallback((
        targetId: string | undefined,
        mutate: (currentEdges: Edge[], id: string | undefined) => EdgeMutationResult,
    ) => {
        const currentNodes = nodesRef?.current ?? nodes;
        const currentEdges = edgesRef?.current ?? edges;
        const result = mutate(currentEdges, targetId);
        if (!result.changed) return false;

        takeSnapshot(currentNodes, currentEdges);
        if (edgesRef) edgesRef.current = result.edges;
        setEdges(result.edges);
        return true;
    }, [edges, edgesRef, nodes, nodesRef, setEdges, takeSnapshot]);

    const handleReverseEdge = useCallback((targetId?: string) => (
        commitEdgeMutation(targetId, reverseDiagramEdge)
    ), [commitEdgeMutation]);

    const handleResetWaypoints = useCallback((targetId?: string) => (
        commitEdgeMutation(targetId, resetDiagramEdgeWaypoints)
    ), [commitEdgeMutation]);

    const handleConvertToEditable = useCallback((targetId?: string) => {
        const currentEdges = edgesRef?.current ?? edges;
        const targetEdge = currentEdges.find(edge => edge.id === targetId);
        const changed = commitEdgeMutation(targetId, convertDiagramEdgeToEditable);
        if (!changed || !targetEdge || !reactFlowInstance) return changed;

        const viewport = reactFlowInstance.getViewport();
        if (!shouldFocusEditableEdge(viewport.zoom)) return changed;

        const center = getEditableEdgeFocusCenter(
            reactFlowInstance.getInternalNode(targetEdge.source),
            reactFlowInstance.getInternalNode(targetEdge.target),
        );
        if (center) {
            const focusEdge = () => {
                void reactFlowInstance.setCenter(center.x, center.y, {
                    zoom: EDITABLE_EDGE_TARGET_ZOOM,
                    duration: 250,
                });
            };
            // The context-menu close is part of the same React event. Focus on the
            // next frame so its selection cleanup cannot cancel the viewport move.
            if (typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(focusEdge);
            } else {
                focusEdge();
            }
        }
        return changed;
    }, [commitEdgeMutation, edges, edgesRef, reactFlowInstance]);

    const handleStopEditing = useCallback((targetId?: string) => (
        commitEdgeMutation(targetId, stopEditingDiagramEdge)
    ), [commitEdgeMutation]);

    // 对齐选中节点
    const handleAlign = useCallback((type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        if (selectedNodes.length < 2) return;
        if (hasMutationLockedNode(selectedNodes)) return;
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
        if (hasMutationLockedNode(selectedNodes)) return;
        takeSnapshot(nodes, edges);

        const sorted = [...selectedNodes].sort((a, b) =>
            type === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y
        );

        if (type === 'horizontal') {
            // 计算所有节点包括子常的总宽度
            const totalWidth = sorted.reduce((s, n) => s + (n.measured?.width || (n.width as number) || 100), 0);
            const firstX = sorted[0].position.x;
            const lastNode = sorted[sorted.length - 1];
            const lastX = lastNode.position.x + (lastNode.measured?.width || (lastNode.width as number) || 100);
            // 可用间距空间均分给 (n-1) 个间隙
            const gap = (lastX - firstX - totalWidth) / (sorted.length - 1);
            let cursor = firstX;
            const posMap = new Map<string, { x: number; y: number }>();
            sorted.forEach(n => {
                posMap.set(n.id, { x: cursor, y: n.position.y });
                cursor += (n.measured?.width || (n.width as number) || 100) + gap;
            });
            setNodes(nds => nds.map(n => {
                const p = posMap.get(n.id);
                return p ? { ...n, position: p } : n;
            }));
        } else {
            const totalHeight = sorted.reduce((s, n) => s + (n.measured?.height || (n.height as number) || 50), 0);
            const firstY = sorted[0].position.y;
            const lastNode = sorted[sorted.length - 1];
            const lastY = lastNode.position.y + (lastNode.measured?.height || (lastNode.height as number) || 50);
            const gap = (lastY - firstY - totalHeight) / (sorted.length - 1);
            let cursor = firstY;
            const posMap = new Map<string, { x: number; y: number }>();
            sorted.forEach(n => {
                posMap.set(n.id, { x: n.position.x, y: cursor });
                cursor += (n.measured?.height || (n.height as number) || 50) + gap;
            });
            setNodes(nds => nds.map(n => {
                const p = posMap.get(n.id);
                return p ? { ...n, position: p } : n;
            }));
        }
    }, [selectedNodes, nodes, edges, setNodes, takeSnapshot]);

    // 统一选中节点尺寸（参照第一个选中节点）
    const handleMatchSize = useCallback((mode: 'width' | 'height' | 'both') => {
        if (selectedNodes.length < 2) return;
        if (hasMutationLockedNode(selectedNodes)) return;
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
            const alignment = action.slice('align:'.length);
            if (isAlignmentType(alignment)) handleAlign(alignment);
            return;
        }
        // 分布操作
        if (action.startsWith('distribute:')) {
            const distribution = action.slice('distribute:'.length);
            if (isDistributionType(distribution)) handleDistribute(distribution);
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
                return handleReverseEdge(targetId);
            case 'resetWaypoints':
                return handleResetWaypoints(targetId);
            case 'convertToEditable':
                return handleConvertToEditable(targetId);
            case 'stopEditing':
                return handleStopEditing(targetId);
            default:
                if (action.startsWith('context:add:flowchart:')) {
                    const suffix = action.split(':').pop();
                    if (suffix && reactFlowInstance && pluginCtx) {
                        // Map shorthand types to internal flowchart shapes
                        const configMap: Record<string, { shape: string, icon: string, main: string }> = {
                            'rect':     { shape: 'rectangle', icon: 'square-o', main: '#1890ff' },
                            'diamond':  { shape: 'diamond',   icon: 'diamond',  main: '#722ed1' },
                            'database': { shape: 'database',  icon: 'database', main: '#fa8c16' },
                            'step':     { shape: 'rectangle', icon: 'file-text',main: '#52c41a' }
                        };
                        const config = configMap[suffix] || { shape: 'rectangle', icon: 'plus', main: '#1890ff' };
                        
                        // Add with slight random offset to prevent perfect overlapping
                        const offset = {
                            x: (Math.random() - 0.5) * 60,
                            y: (Math.random() - 0.5) * 60
                        };
                        
                        pluginCtx.addNode('flowchart', { 
                            shape: config.shape,
                            icon: config.icon,
                            theme: { main: config.main, border: config.main, text: '#fff' },
                            label: `New ${suffix.charAt(0).toUpperCase() + suffix.slice(1)}`,
                            position: offset 
                        });
                    }
                }
                break;
        }
    }, [handleDelete, handleDuplicate, handleBringToFront, handleSendToBack, handleFitView, handleLock, handleReverseEdge, handleResetWaypoints, handleConvertToEditable, handleStopEditing, handleAlign, handleDistribute, handleMatchSize, reactFlowInstance, pluginCtx]);

    return {
        handleDelete,
        handleDuplicate,
        handleSelectAll,
        handleFitView,
        handleBringToFront,
        handleSendToBack,
        onContextMenuAction,
        handleLock,
        // 暴露之前仅内部使用的功能，供命令面板和统一入口使用
        handleMatchSize,
        handleReverseEdge,
        handleDistribute,
        handleAlign,
    };
};
