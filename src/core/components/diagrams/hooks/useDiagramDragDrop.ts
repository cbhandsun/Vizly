import { useCallback, useRef, useEffect } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { projectScreenPositionToFlowPosition, readDomViewport } from '../../../utils/domViewport';
import type { SnapDelta } from '../../../hooks/useSmartGuides';
import type { ClipboardData } from '../../../utils/flowchartClipboard';
import type { HistorySnapshotOptions } from '../../../hooks/useDiagramHistory';
import { parseDragNodeTemplate, parseReverseImportDiagramState } from '../../../utils/dragDropPayload';
import { getReverseImportImageFileError } from '../../../utils/fileImportGuards';
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
    onSmartNodeDrag?: (event: MouseEvent | TouchEvent, node: Node, nodes: Node[]) => SnapDelta | null;
    clearGuides: () => void;
    enableAltDuplicate?: boolean;
    isConnecting?: boolean; 
    activeLayerId?: string;
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
    onSmartNodeDrag,
    clearGuides,
    enableAltDuplicate = true,
    isConnecting = false, // 默认为 false
    activeLayerId = 'layer-0', // ⭐ 默认图层ID
}: UseDiagramDragDropProps) => {

    // 🚀 P2: Sync-Ref Bridge — 避免 onNodeDragStart 依赖 [nodes, edges]
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    const dragTargetIdRef = useRef<string | null>(null);
    const dragRafIdRef = useRef<number | null>(null); // ⭐ P4: onNodeDrag RAF 节流
    const smartGuideRafRef = useRef<number | null>(null); // 🚀 P3: SmartGuides RAF 节流
    const lastActiveSnapDeltaRef = useRef<SnapDelta | null>(null);
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
                const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name);
                
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
        takeSnapshot(nodesRef.current, edgesRef.current, undefined, {
            notify: false,
            dedupe: false,
        });
        setIsDragging(true);
        dragTargetIdRef.current = null;
    }, [enableAltDuplicate, isConnecting, takeSnapshot, setIsDragging, setNodes]);

    // ⭐ 防振荡：记录上次 snap 签名，避免重复 snap
    const lastSnapSigRef = useRef('');

    const onNodeDrag = useCallback((event: MouseEvent | TouchEvent, node: Node, draggedNodes: Node[]) => {
        // 🚀 P3: Smart Guides 吸附纳入 RAF 节流
        //   避免每个 mousemove 同步执行 O(n) 对齐计算
        if (onSmartNodeDrag) {
            if (smartGuideRafRef.current !== null) {
                cancelAnimationFrame(smartGuideRafRef.current);
            }
            // 捕获当前帧的 node 和当前拖动节点引用
            const capturedNode = node;
            const capturedDraggedNodes = draggedNodes;
            smartGuideRafRef.current = requestAnimationFrame(() => {
                smartGuideRafRef.current = null;
                const snapDelta = onSmartNodeDrag(event, capturedNode, capturedDraggedNodes);
                if (snapDelta && (Math.abs(snapDelta.x) > 0.5 || Math.abs(snapDelta.y) > 0.5)) {
                    // 防振荡：生成签名，与上次相同则跳过
                    const sig = `${capturedNode.id}:${snapDelta.x.toFixed(1)}:${snapDelta.y.toFixed(1)}`;
                    if (sig !== lastSnapSigRef.current) {
                        lastSnapSigRef.current = sig;
                        // [FIX] Save the delta for drop persistence
                        lastActiveSnapDeltaRef.current = snapDelta;

                        setNodes(nds => nds.map(n => {
                            if (n.id !== capturedNode.id) return n;
                            return {
                                ...n,
                                position: {
                                    x: n.position.x + snapDelta.x,
                                    y: n.position.y + snapDelta.y
                                }
                            };
                        }));
                    }
                } else {
                    // 无吸附时清空签名，允许下次吸附
                    lastSnapSigRef.current = '';
                    lastActiveSnapDeltaRef.current = null;
                }
            });
        }

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
    }, [onSmartNodeDrag, setNodes]);

    const onNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, node: Node, draggedNodes: Node[]) => {
        // ⭐ P4: 清理pending的RAF
        if (dragRafIdRef.current !== null) {
            cancelAnimationFrame(dragRafIdRef.current);
            dragRafIdRef.current = null;
        }
        // 🚀 P3: 清理 SmartGuides RAF
        if (smartGuideRafRef.current !== null) {
            cancelAnimationFrame(smartGuideRafRef.current);
            smartGuideRafRef.current = null;
        }

        // [FIX] Capture the active snapDelta before clearing guides so we can cement the drop location
        // React Flow natively enforces snapToGrid when the drag drops, which discards our custom snapDelta
        // causing the node to jump back to strict grid coordinates upon release.
        const finalSnapDelta = lastActiveSnapDeltaRef.current;
        lastActiveSnapDeltaRef.current = null;

        setIsDragging(false);
        notifyHistoryChanged();
        clearGuides();
        const graphNodes = mergeDraggedNodesIntoGraph(
            nodesRef.current,
            node,
            draggedNodes,
        );
        const targetId = findNodeParentCandidate(node, graphNodes)?.id ?? null;

        // 清理 CSS 高亮（使用 DOM 操作，避免触发 React 重新渲染）
        if (dragTargetIdRef.current) {
            const element = document.querySelector(`[data-id="${dragTargetIdRef.current}"]`);
            element?.classList.remove('drop-target-highlight');
        }
        dragTargetIdRef.current = null;

        const parentCandidate = targetId ? graphNodes.find(n => n.id === targetId) : null;

        if (parentCandidate) {
            // [DDD] Mind Map Domain Event (Delegate reparenting to Orchestrator)
            if (node.type === 'mindmap' && parentCandidate.type === 'mindmap') {
                if (typeof window !== 'undefined') {
                    const finalPosition = lastMindmapDropPosRef.current || 'inside';
                    window.dispatchEvent(new CustomEvent('mindmap:reparent', {
                        detail: { nodeId: node.id, targetId: parentCandidate.id, position: finalPosition }
                    }));
                    lastMindmapDropPosRef.current = null;
                }
                return; // Stop standard Group parenting execution
            }

            // Parent Found!
            // 1. Check if already parented to this one to avoid churn
            if (node.parentId === parentCandidate.id) return;

            setNodes((nds) => {
                const CONTAINER_PADDING = 24;
                const parentAbsolute = getNodeAbsolutePosition(parentCandidate, nds);
                const childAbsolute = getNodeAbsolutePosition(node, nds);

                // Child's new relative position inside parent
                const childRelX = childAbsolute.x - parentAbsolute.x;
                const childRelY = childAbsolute.y - parentAbsolute.y;
                const childW = node.measured?.width || node.width || 140;
                const childH = node.measured?.height || node.height || 70;

                // Current parent size
                const parentW = Number(parentCandidate.style?.width) || parentCandidate.measured?.width || parentCandidate.width || 400;
                const parentH = Number(parentCandidate.style?.height) || parentCandidate.measured?.height || parentCandidate.height || 300;

                // 🆕 Auto-Expand: calculate needed size
                const neededW = Math.max(parentW, childRelX + childW + CONTAINER_PADDING);
                const neededH = Math.max(parentH, childRelY + childH + CONTAINER_PADDING);
                const needsExpand = neededW > parentW || neededH > parentH;

                return nds.map((n) => {
                    if (n.id === node.id) {
                        return {
                            ...n,
                            parentId: parentCandidate.id,
                            extent: 'parent',
                            position: {
                                x: childRelX + (finalSnapDelta ? finalSnapDelta.x : 0),
                                y: childRelY + (finalSnapDelta ? finalSnapDelta.y : 0)
                            },
                            data: {
                                ...n.data,
                                domain: parentCandidate.data.domain || parentCandidate.data.domainClass
                            }
                        };
                    }
                    // 🆕 Auto-Expand: resize parent if needed
                    if (n.id === parentCandidate.id && needsExpand) {
                        return {
                            ...n,
                            style: {
                                ...n.style,
                                width: neededW,
                                height: neededH,
                            }
                        };
                    }
                    return n;
                });
            });
        } else {
            // No parent found (dropped on canvas)
            if (node.parentId) {
                // Was parented, now unparenting
                setNodes((nds) => nds.map((n) => {
                    if (n.id === node.id) {
                        // Convert relative back to absolute
                        const absolute = getNodeAbsolutePosition(node, graphNodes);

                        const { parentId: _p, extent: _e, ...rest } = n; // Remove parentId/extent
                        return {
                            ...rest,
                            position: { 
                                x: absolute.x + (finalSnapDelta ? finalSnapDelta.x : 0),
                                y: absolute.y + (finalSnapDelta ? finalSnapDelta.y : 0),
                            }
                        };
                    }
                    return n;
                }));
            } else if (finalSnapDelta && (finalSnapDelta.x !== 0 || finalSnapDelta.y !== 0)) {
                // Std top-level drop on canvas: re-apply the snapDelta asynchronously to override React Flow's native snapToGrid update
                setTimeout(() => {
                    setNodes((nds) => nds.map((n) => {
                        if (n.id !== node.id) return n;
                        return {
                            ...n,
                            position: {
                                x: n.position.x + finalSnapDelta.x,
                                y: n.position.y + finalSnapDelta.y
                            }
                        };
                    }));
                }, 0);
            }
        }
    }, [setIsDragging, setNodes, clearGuides, notifyHistoryChanged]);

    return {
        onDragOver,
        onDrop,
        onNodeDragStart,
        onNodeDrag,
        onNodeDragStop
    };
};
