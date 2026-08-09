import { useCallback, useRef, useEffect } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { projectScreenPositionToFlowPosition, readDomViewport } from '../../../utils/domViewport';
import type { SnapDelta } from '../../../hooks/useSmartGuides';
import type { ClipboardData } from '../../../utils/flowchartClipboard';
import type { HistorySnapshotOptions } from '../../../hooks/useDiagramHistory';
import { parseDragNodeTemplate, parseReverseImportDiagramState } from '../../../utils/dragDropPayload';
import { getReverseImportImageFileError, isImageLikeImportFile } from '../../../utils/fileImportGuards';
import {
    logDiagramDragDropFailure,
    logDiagramDragDropImportRejected,
    logDiagramDragDropReverseImportFailure,
} from './diagramInteractionLogging';
import { createSwimlaneDropNodes } from './diagramDropSwimlaneFactory';
import {
    findNodeParentCandidate,
    findNodeParentPreviewCandidate,
    getNodeAbsolutePosition,
    mergeDraggedNodesIntoGraph,
} from './diagramNodeParenting';
import {
    applyContainerDrop,
    applySnapDeltaToNodes,
    collectDraggedNodeIds,
    detachDraggedNodesFromParents,
    resolveDraggedNodeParenting,
} from './diagramContainerDrop';

interface UseDiagramDragDropProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>; // ⭐ Phase 10: 恢复连线
    takeSnapshot: (
        nodes: Node[],
        edges: Edge[],
        label?: string,
        options?: HistorySnapshotOptions,
    ) => void;
    notifyHistoryChanged: () => void;
    reactFlowInstance: ReactFlowInstance | null;
    setIsDragging: (dragging: boolean) => void;
    snapDeltaRef?: Readonly<{ current: SnapDelta | null }>;
    clearGuides: () => void;
    enableAltDuplicate?: boolean;
    isConnecting?: boolean; 
    activeLayerId?: string;
    moveHistoryLabel: string;
}

export const useDiagramDragDrop = ({
    nodes,
    edges,
    setNodes,
    setEdges, // ⭐ Fix: add setEdges here
    takeSnapshot,
    notifyHistoryChanged,
    reactFlowInstance,
    setIsDragging,
    snapDeltaRef,
    clearGuides,
    enableAltDuplicate = true,
    isConnecting = false, // 默认为 false
    activeLayerId = 'layer-0', // ⭐ 默认图层ID
    moveHistoryLabel,
}: UseDiagramDragDropProps) => {

    // 🚀 P2: Sync-Ref Bridge — 避免 onNodeDragStart 依赖 [nodes, edges]
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    const dragTargetIdRef = useRef<string | null>(null);
    const dragRafIdRef = useRef<number | null>(null); // ⭐ P4: onNodeDrag RAF 节流
    const lastMindmapDropPosRef = useRef<'above' | 'below' | 'inside' | null>(null);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        async (event: React.DragEvent) => {
            event.preventDefault();

            if (!reactFlowInstance) return;

            // ─── Phase 10: Reverse Import (Image-as-Source) ───
            const files = Array.from(event.dataTransfer.files);
            if (files.length > 0) {
                const file = files[0];
                const isImage = isImageLikeImportFile(file);
                
                if (isImage) {
                    try {
                        const importError = getReverseImportImageFileError(file);
                        if (importError) {
                            logDiagramDragDropImportRejected(importError);
                            return;
                        }

                        let safeDiagramState: ClipboardData | null = null;

                        // 从 PNG/JPG/WebP/GIF/AVIF 尾部元数据解析图表状态；SVG 被文件守卫拒绝。
                        const buffer = await file.arrayBuffer();
                        const uint8 = new Uint8Array(buffer);
                        const textDecoder = new TextDecoder();
                        const fullContent = textDecoder.decode(uint8);

                        const startMarker = 'VIZLY_META_START';
                        const endMarker = 'VIZLY_META_END';

                        const startIndex = fullContent.lastIndexOf(startMarker);
                        const endIndex = fullContent.lastIndexOf(endMarker);

                        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                            const rawJson = fullContent.substring(startIndex + startMarker.length, endIndex);
                            safeDiagramState = parseReverseImportDiagramState(rawJson);
                        }

                        if (safeDiagramState) {
                            takeSnapshot(nodesRef.current, edgesRef.current);
                            // 优雅地合并或替换
                            // 这里采用“智能提示/直接恢复”策略，Phase 10 默认为直接恢复
                            setNodes(safeDiagramState.nodes);
                            setEdges(safeDiagramState.edges);
                            
                            // 自定义事件通知 UI 恢复成功
                            window.dispatchEvent(new CustomEvent('vizly:reverse-import-success', { 
                                detail: { filename: file.name } 
                            }));
                            return;
                        }
                    } catch (err) {
                        logDiagramDragDropReverseImportFailure(err);
                    }
                }
            }

            const typeData = event.dataTransfer.getData('application/reactflow');
            // ... (Rest of existing drop logic)

            // Check if the dropped data is valid
            if (!typeData) return;

            try {
                const template = parseDragNodeTemplate(typeData);
                if (!template) return;
                const { typeName, label, config, offsetX, offsetY } = template;

                // ═══════════════════════════════════════════════════════════════
                // Counter-Zoom 已启用 (zoom: 1/uiScale)，
                // .react-flow 在有效 zoom=1.0 空间运作，
                // BCR 和 clientX 在同一物理像素空间，无需 uiScale 补偿。
                // ═══════════════════════════════════════════════════════════════

                // 1. 从 DOM 读取真实的 viewport transform（绕过 getViewport() 陈旧值 bug）
                const { x: vpX, y: vpY, zoom: vpZoom } = readDomViewport();

                // 2. ✨ 核心体验修复：智能计算释放幽灵坐标 (对齐释放时光标与中心点)
                let finalOffsetX = offsetX || 0;
                let finalOffsetY = offsetY || 0;
                
                // 自动对齐：根据即将生成的节点预期宽高，自动将节点中心置于鼠标坐标，解决大尺寸组件(时间线、泳道)释放偏移过大问题
                if (typeName === 'titleGroup') { finalOffsetX = 200; finalOffsetY = 150; }
                else if (typeName === 'subGroup') { finalOffsetX = 125; finalOffsetY = 75; }
                else if (typeName === 'arrowTimeline') { finalOffsetX = 275; finalOffsetY = 35; }
                else if (typeName === 'swimlane') { finalOffsetX = 400; finalOffsetY = 250; }
                else if (typeName === 'iconNode') { finalOffsetX = 32; finalOffsetY = 32; } // 64x64 center
                else { finalOffsetX = 70; finalOffsetY = 35; } // 默认基础尺寸中心(140x70)

                const ghostLeftScreenX = event.clientX - finalOffsetX;
                const ghostTopScreenY = event.clientY - finalOffsetY;

                let flowX = 0;
                let flowY = 0;

                // ⭐ 优先使用 React Flow 提供且已在 Counter-Zoom 环境下被修复的原生转换 API
                if (reactFlowInstance) {
                    const projected = reactFlowInstance.screenToFlowPosition({ x: ghostLeftScreenX, y: ghostTopScreenY });
                    flowX = projected.x;
                    flowY = projected.y;
                } else {
                    // 退级方案
                    const { x: flowXFallback, y: flowYFallback } = projectScreenPositionToFlowPosition({
                        screenX: ghostLeftScreenX,
                        screenY: ghostTopScreenY,
                        viewport: { x: vpX, y: vpY, zoom: vpZoom },
                    });
                    flowX = flowXFallback;
                    flowY = flowYFallback;
                }

                // 3. 新节点位置（直接贴合）
                const position = {
                    x: Math.round(flowX / 5) * 5, // 轻微网格吸附，防止非整数像素模糊
                    y: Math.round(flowY / 5) * 5,
                };

                takeSnapshot(nodesRef.current, edgesRef.current);

                const currentNodes = nodesRef.current;
                const newNodeId = `node-${currentNodes.length + 1}-${Date.now()}`;

                // Check for drop target (Parenting)
                const parentCandidate = currentNodes.find(n => {
                    if (n.type !== 'titleGroup' && n.type !== 'subGroup' && n.type !== 'swimlane') return false;
                    const x = n.position.x;
                    const y = n.position.y;
                    const w = n.measured?.width || n.width || 0;
                    const h = n.measured?.height || n.height || 0;
                    return position.x >= x && position.x <= x + w && position.y >= y && position.y <= y + h;
                });

                // ⭐ Swimlane: create container + child titleGroup nodes as lanes
                if (typeName === 'swimlane') {
                    const swimlaneNodes = createSwimlaneDropNodes({
                        containerId: newNodeId,
                        position,
                        label,
                        config,
                        layerId: activeLayerId,
                    });
                    setNodes((nds) => nds.concat(swimlaneNodes));
                    return;
                }

                let finalPosition = position;
                let parentId: string | undefined;
                let extent: 'parent' | undefined;

                if (parentCandidate) {
                    parentId = parentCandidate.id;
                    extent = 'parent';
                    finalPosition = {
                        x: position.x - parentCandidate.position.x,
                        y: position.y - parentCandidate.position.y
                    };
                }

                const newNode: Node = {
                    id: newNodeId,
                    type: typeName,
                    position: finalPosition,
                    parentId,
                    extent,
                    className: 'node-drop-bounce', // ⭐ 触感微动效：物理弹性下落
                    data: {
                        label,
                        description: label,
                        layer: activeLayerId, // ⭐ 设置节点所属图层
                        ...config,
                        // Inherit domain if nested
                        ...(parentCandidate ? { domain: parentCandidate.data.domain || parentCandidate.data.domainClass } : {})
                    },
                    // Set default sizes for containers
                    style: typeName === 'titleGroup'
                        ? { width: 400, height: 300 }
                        : typeName === 'subGroup'
                            ? { width: 250, height: 150 }
                            : typeName === 'arrowTimeline'
                                ? undefined // 允许内部基于 SVG_WIDTH 自动撑开外部 ReactFlow 容器
                                : typeName === 'iconNode'
                                    ? { width: 64, height: 64 }
                                    : { width: 140, height: 70 },
                    zIndex: typeName === 'titleGroup' ? -1 : typeName === 'subGroup' ? 0 : 2,
                };

                setNodes((nds) => nds.concat(newNode));
            } catch (err) {
                logDiagramDragDropFailure(err);
            }
        },
        // [P-2] Use nodesRef/edgesRef instead of nodes/edges in deps.
        // nodes/edges in the dep array caused onDrop to rebuild on every node state change
        // (selection, drag, position), making the callback always fresh but expensively.
        [reactFlowInstance, takeSnapshot, setNodes, setEdges, activeLayerId]
    );

    const onNodeDragStart = useCallback((event: MouseEvent | TouchEvent, node: Node) => {
        // 禁用连线时的 Alt 复制功能
        const shouldDuplicate = enableAltDuplicate && event.altKey && !isConnecting;

        if (shouldDuplicate) {
            // Create a copy of the node with a new ID
            const newNodeId = `${node.id} -copy - ${Date.now()} `;
            const newNode: Node = {
                ...node,
                id: newNodeId,
                position: { ...node.position }, // Start at same position
                selected: true,
                data: { ...node.data } // Deep copy data
            };

            // Add the new node and deselect the original
            setNodes(nds => [
                ...nds.map(n => n.id === node.id ? { ...n, selected: false } : n),
                newNode
            ]);
        }

        // 🚀 P2: 使用 Ref 替代直接依赖 nodes/edges，避免回调在拖动期间重建
        takeSnapshot(nodesRef.current, edgesRef.current, moveHistoryLabel, {
            notify: false,
            dedupe: false,
        });
        setIsDragging(true);
        dragTargetIdRef.current = null;
    }, [enableAltDuplicate, isConnecting, moveHistoryLabel, takeSnapshot, setIsDragging, setNodes]);

    const onNodeDrag = useCallback((event: MouseEvent | TouchEvent, node: Node, draggedNodes: Node[]) => {
        // ⭐ P4: 容器预览用 RAF 节流（非关键路径）
        if (dragRafIdRef.current !== null) return;

        dragRafIdRef.current = requestAnimationFrame(() => {
            dragRafIdRef.current = null;

            const graphNodes = mergeDraggedNodesIntoGraph(
                nodesRef.current,
                node,
                draggedNodes,
            );
            const enableParentPreview = graphNodes.length <= 200;
            if (!enableParentPreview) {
                return;
            }

            const parentCandidate = findNodeParentPreviewCandidate(node, graphNodes);

            const newTargetId = parentCandidate?.id || null;
            let dropPosition: 'above' | 'below' | 'inside' | null = null;
            
            // [DDD] Mind Map Position Detection
            if (parentCandidate && node.type === 'mindmap' && parentCandidate.type === 'mindmap') {
                const nodeAbsolute = getNodeAbsolutePosition(node, graphNodes);
                const nodeCenterY = nodeAbsolute.y + (node.measured?.height || node.height || 0) / 2;
                const absY = getNodeAbsolutePosition(parentCandidate, graphNodes).y;
                const h = parentCandidate.measured?.height || parentCandidate.height || 0;
                // If dragged near the top 30% -> insert above
                if (nodeCenterY < absY + h * 0.3) {
                    dropPosition = 'above';
                } 
                // If dragged near the bottom 30% -> insert below
                else if (nodeCenterY > absY + h * 0.7) {
                    dropPosition = 'below';
                } 
                // Otherwise insert as child
                else {
                    dropPosition = 'inside';
                }
            }

            // 使用 CSS 类名替代 React 状态更新，避免抖动
            if (
                newTargetId !== dragTargetIdRef.current
                || dropPosition !== lastMindmapDropPosRef.current
            ) {
                // 移除旧高亮
                if (dragTargetIdRef.current) {
                    const oldElement = document.querySelector(`[data-id="${dragTargetIdRef.current}"]`);
                    oldElement?.classList.remove('drop-target-highlight', 'drop-above', 'drop-below', 'drop-inside');
                }

                // 添加新高亮
                if (newTargetId) {
                    const newElement = document.querySelector(`[data-id="${newTargetId}"]`);
                    newElement?.classList.add('drop-target-highlight');
                    if (dropPosition) {
                         newElement?.classList.add(`drop-${dropPosition}`);
                         lastMindmapDropPosRef.current = dropPosition;
                    } else {
                         lastMindmapDropPosRef.current = null;
                    }
                }
                
                if (!newTargetId) {
                    lastMindmapDropPosRef.current = null;
                }

                dragTargetIdRef.current = newTargetId;
            }
        });
    }, []);

    const onNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, node: Node, draggedNodes: Node[]) => {
        // ⭐ P4: 清理pending的RAF
        if (dragRafIdRef.current !== null) {
            cancelAnimationFrame(dragRafIdRef.current);
            dragRafIdRef.current = null;
        }
        // [FIX] Capture the active snapDelta before clearing guides so we can cement the drop location
        // React Flow natively enforces snapToGrid when the drag drops, which discards our custom snapDelta
        // causing the node to jump back to strict grid coordinates upon release.
        const finalSnapDelta = snapDeltaRef?.current ?? null;

        setIsDragging(false);
        notifyHistoryChanged();
        clearGuides();
        const graphNodes = mergeDraggedNodesIntoGraph(
            nodesRef.current,
            node,
            draggedNodes,
        );
        const draggedNodeIds = collectDraggedNodeIds(node, draggedNodes);
        const primaryParentCandidate = findNodeParentCandidate(node, graphNodes);

        // 清理 CSS 高亮（使用 DOM 操作，避免触发 React 重新渲染）
        if (dragTargetIdRef.current) {
            const element = document.querySelector(`[data-id="${dragTargetIdRef.current}"]`);
            element?.classList.remove('drop-target-highlight');
        }
        dragTargetIdRef.current = null;

        if (primaryParentCandidate) {
            // [DDD] Mind Map Domain Event (Delegate reparenting to Orchestrator)
            if (node.type === 'mindmap' && primaryParentCandidate.type === 'mindmap') {
                if (typeof window !== 'undefined') {
                    const finalPosition = lastMindmapDropPosRef.current || 'inside';
                    window.dispatchEvent(new CustomEvent('mindmap:reparent', {
                        detail: { nodeId: node.id, targetId: primaryParentCandidate.id, position: finalPosition }
                    }));
                    lastMindmapDropPosRef.current = null;
                }
                return; // Stop standard Group parenting execution
            }
        }

        const { containerGroups, canvasNodeIds } = resolveDraggedNodeParenting(
            graphNodes,
            draggedNodeIds,
        );
        const graphById = new Map(graphNodes.map(graphNode => [graphNode.id, graphNode]));
        const parentedCanvasNodeIds = canvasNodeIds.filter(id => graphById.get(id)?.parentId);

        if (containerGroups.length > 0 || parentedCanvasNodeIds.length > 0) {
            setNodes(nds => {
                const reparented = containerGroups.reduce((currentNodes, group) => (
                    applyContainerDrop({
                        nodes: currentNodes,
                        graphNodes,
                        draggedNodeIds: group.draggedNodeIds,
                        parentCandidate: group.parentCandidate,
                        snapDelta: finalSnapDelta,
                    })
                ), nds);

                return parentedCanvasNodeIds.length > 0
                    ? detachDraggedNodesFromParents({
                        nodes: reparented,
                        graphNodes,
                        draggedNodeIds: parentedCanvasNodeIds,
                        snapDelta: finalSnapDelta,
                    })
                    : reparented;
            });
        }

        const topLevelCanvasNodeIds = new Set(
            canvasNodeIds.filter(id => !graphById.get(id)?.parentId),
        );
        if (
            topLevelCanvasNodeIds.size > 0
            && finalSnapDelta
            && (finalSnapDelta.x !== 0 || finalSnapDelta.y !== 0)
        ) {
            // Std top-level drop on canvas: re-apply the snapDelta asynchronously to override React Flow's native snapToGrid update
            setTimeout(() => {
                setNodes(nds => applySnapDeltaToNodes(nds, topLevelCanvasNodeIds, finalSnapDelta));
            }, 0);
        }
    }, [setIsDragging, setNodes, clearGuides, notifyHistoryChanged, snapDeltaRef]);

    return {
        onDragOver,
        onDrop,
        onNodeDragStart,
        onNodeDrag,
        onNodeDragStop
    };
};
