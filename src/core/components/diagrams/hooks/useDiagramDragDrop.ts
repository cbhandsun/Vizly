import { useCallback, useRef, useEffect } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { readDomViewport } from '../../../utils/domViewport';
import type { SnapDelta } from '../../../hooks/useSmartGuides';

interface UseDiagramDragDropProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance | null;
    setIsDragging: (dragging: boolean) => void;
    onSmartNodeDrag?: (e: React.MouseEvent, node: Node, nodes: Node[]) => SnapDelta | null;
    clearGuides: () => void;
    enableAltDuplicate?: boolean;
    isConnecting?: boolean; // 新增：用于禁用连线时的 Alt 复制
    activeLayerId?: string; // ⭐ 新增：当前活动图层ID
}

export const useDiagramDragDrop = ({
    nodes,
    edges,
    setNodes,
    takeSnapshot,
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

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            if (!reactFlowInstance) return;

            const typeData = event.dataTransfer.getData('application/reactflow');

            // Check if the dropped data is valid
            if (!typeData) return;

            try {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { typeName, label, config, offsetX, offsetY } = JSON.parse(typeData);

                // ═══════════════════════════════════════════════════════════════
                // Counter-Zoom 已启用 (zoom: 1/uiScale)，
                // .react-flow 在有效 zoom=1.0 空间运作，
                // BCR 和 clientX 在同一物理像素空间，无需 uiScale 补偿。
                // ═══════════════════════════════════════════════════════════════

                // 1. 从 DOM 读取真实的 viewport transform（绕过 getViewport() 陈旧值 bug）
                const { x: vpX, y: vpY, zoom: vpZoom } = readDomViewport();

                // 2. 获取 .react-flow 容器的 BCR
                const rfContainer = document.querySelector('.react-flow') as HTMLElement | null;
                const bcr = rfContainer?.getBoundingClientRect();
                const bcrLeft = bcr?.left ?? 0;
                const bcrTop = bcr?.top ?? 0;

                // 3. ✨ 核心体验修复：智能计算释放幽灵坐标 (对齐释放时光标与中心点)
                let finalOffsetX = offsetX || 0;
                let finalOffsetY = offsetY || 0;
                
                // 自动对齐：根据即将生成的节点预期宽高，自动将节点中心置于鼠标坐标，解决大尺寸组件(时间线、泳道)释放偏移过大问题
                if (typeName === 'titleGroup') { finalOffsetX = 200; finalOffsetY = 150; }
                else if (typeName === 'subGroup') { finalOffsetX = 125; finalOffsetY = 75; }
                else if (typeName === 'arrowTimeline') { finalOffsetX = 275; finalOffsetY = 35; }
                else if (typeName === 'swimlane') { finalOffsetX = 400; finalOffsetY = 250; }
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
                    const flowXFallback = (ghostLeftScreenX - bcrLeft - vpX) / vpZoom;
                    const flowYFallback = (ghostTopScreenY - bcrTop - vpY) / vpZoom;
                    flowX = flowXFallback;
                    flowY = flowYFallback;
                }

                // 4. 新节点位置（直接贴合）
                let position = {
                    x: Math.round(flowX / 5) * 5, // 轻微网格吸附，防止非整数像素模糊
                    y: Math.round(flowY / 5) * 5,
                };

                takeSnapshot(nodes, edges);

                const newNodeId = `node-${nodes.length + 1}-${Date.now()}`;

                // Check for drop target (Parenting)
                const parentCandidate = nodes.find(n => {
                    if (n.type !== 'titleGroup' && n.type !== 'subGroup' && n.type !== 'swimlane') return false;
                    const x = n.position.x;
                    const y = n.position.y;
                    const w = n.measured?.width || n.width || 0;
                    const h = n.measured?.height || n.height || 0;
                    return position.x >= x && position.x <= x + w && position.y >= y && position.y <= y + h;
                });

                // ⭐ Swimlane: create container + child titleGroup nodes as lanes
                if (typeName === 'swimlane') {
                    const lanes = config?.lanes || [
                        { id: 'lane-1', label: '用户', color: '#3b82f6' },
                        { id: 'lane-2', label: '系统', color: '#10b981' },
                        { id: 'lane-3', label: '第三方', color: '#f59e0b' },
                    ];
                    const containerW = 800;
                    const containerH = 500;
                    const headerH = 36;
                    const isHorizontal = config?.direction !== 'vertical';

                    // Initial Layout Calculation
                    const laneW = isHorizontal ? containerW : Math.floor(containerW / lanes.length);
                    const laneH = isHorizontal ? Math.floor((containerH - headerH) / lanes.length) : (containerH - headerH);

                    const swimlaneNode: Node = {
                        id: newNodeId,
                        type: 'swimlane',
                        position,
                        data: {
                            label: label || 'Swimlane',
                            direction: config?.direction || 'horizontal',
                            layer: activeLayerId,
                            laneCount: lanes.length, // Store count for resizing logic
                        },
                        style: { width: containerW, height: containerH },
                        zIndex: -2,
                    };

                    const laneNodes: Node[] = lanes.map((lane: { id: string; label: string; color?: string }, idx: number) => ({
                        id: `${newNodeId} -${lane.id} `,
                        type: 'titleGroup',
                        // Position is relative to parent
                        position: isHorizontal
                            ? { x: 0, y: headerH + idx * laneH }
                            : { x: idx * laneW, y: headerH },
                        parentId: newNodeId,
                        extent: 'parent' as const,
                        data: {
                            label: lane.label,
                            description: lane.label,
                            themeColor: lane.color || '#6366f1',
                            titleBarHeight: 28,
                            layer: activeLayerId,
                            isLane: true, // ⭐ Enable lane styling (squared corners, no shadow)
                            domainClass: 'core', // Default to core for consistent styling
                        },
                        style: { width: laneW, height: laneH },
                        zIndex: -1,
                    }));

                    setNodes((nds) => nds.concat(swimlaneNode, ...laneNodes));
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
                                : { width: 140, height: 70 },
                    zIndex: typeName === 'titleGroup' ? -1 : typeName === 'subGroup' ? 0 : 2,
                };

                setNodes((nds) => nds.concat(newNode));
            } catch (err) {
                console.error('Drop failed', err);
            }
        },
        [reactFlowInstance, nodes, edges, takeSnapshot, setNodes, activeLayerId]
    );

    const onNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
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
        takeSnapshot(nodesRef.current, edgesRef.current);
        setIsDragging(true);
        dragTargetIdRef.current = null;
    }, [enableAltDuplicate, isConnecting, takeSnapshot, setIsDragging, setNodes]);

    // ⭐ 防振荡：记录上次 snap 签名，避免重复 snap
    const lastSnapSigRef = useRef('');

    const onNodeDrag = useCallback((e: React.MouseEvent, node: Node, allNodes: Node[]) => {
        // 🚀 P3: Smart Guides 吸附纳入 RAF 节流
        //   避免每个 mousemove 同步执行 O(n) 对齐计算
        if (onSmartNodeDrag) {
            if (smartGuideRafRef.current !== null) {
                cancelAnimationFrame(smartGuideRafRef.current);
            }
            // 捕获当前帧的 node 和 allNodes 引用
            const capturedNode = node;
            const capturedAllNodes = allNodes;
            smartGuideRafRef.current = requestAnimationFrame(() => {
                smartGuideRafRef.current = null;
                const snapDelta = onSmartNodeDrag(e, capturedNode, capturedAllNodes);
                if (snapDelta && (Math.abs(snapDelta.x) > 0.5 || Math.abs(snapDelta.y) > 0.5)) {
                    // 防振荡：生成签名，与上次相同则跳过
                    const sig = `${capturedNode.id}:${snapDelta.x.toFixed(1)}:${snapDelta.y.toFixed(1)}`;
                    if (sig !== lastSnapSigRef.current) {
                        lastSnapSigRef.current = sig;
                        // [FIX] Save the delta for drop persistence
                        if (typeof window !== 'undefined') {
                            (window as any)._lastActiveSnapDelta = snapDelta;
                        }

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
                    if (typeof window !== 'undefined') {
                        (window as any)._lastActiveSnapDelta = null;
                    }
                }
            });
        }

        // ⭐ P4: 容器预览用 RAF 节流（非关键路径）
        if (dragRafIdRef.current !== null) return;

        dragRafIdRef.current = requestAnimationFrame(() => {
            dragRafIdRef.current = null;

            const enableParentPreview = allNodes.length <= 200;
            if (!enableParentPreview) {
                return;
            }

            // Calculate Center
            const nodeCenterX = node.position.x + (node.measured?.width || node.width || 0) / 2;
            const nodeCenterY = node.position.y + (node.measured?.height || node.height || 0) / 2;

            const parentCandidate = allNodes.find(n => {
                if (n.id === node.id) return false;

                // [DDD] Mind Map Magnetic Target Candidate
                if (node.type === 'mindmap' && n.type === 'mindmap') {
                    const absX = n.position.x;
                    const absY = n.position.y;
                    const w = n.measured?.width || n.width || 0;
                    const h = n.measured?.height || n.height || 0;
                    const hitPadding = 20; // 增大磁性吸附范围
                    return nodeCenterX >= absX - hitPadding && nodeCenterX <= absX + w + hitPadding &&
                           nodeCenterY >= absY - hitPadding && nodeCenterY <= absY + h + hitPadding;
                }

                if (n.type !== 'titleGroup' && n.type !== 'subGroup' && n.type !== 'swimlane') return false;
                if (node.type === 'swimlane') return false;

                // 🆕 Calculate Absolute Position for nested nodes (like swimlane lanes)
                let absX = n.position.x;
                let absY = n.position.y;
                let currentParentId = n.parentId;
                while (currentParentId) {
                    const parentNode = allNodes.find(p => p.id === currentParentId);
                    if (parentNode) {
                        absX += parentNode.position.x;
                        absY += parentNode.position.y;
                        currentParentId = parentNode.parentId;
                    } else {
                        break;
                    }
                }

                const w = n.measured?.width || n.width || 0;
                const h = n.measured?.height || n.height || 0;

                // Hit detection using absolute coordinates
                return nodeCenterX >= absX && nodeCenterX <= absX + w &&
                    nodeCenterY >= absY && nodeCenterY <= absY + h;
            });

            const newTargetId = parentCandidate?.id || null;
            let dropPosition: 'above' | 'below' | 'inside' | null = null;
            
            // [DDD] Mind Map Position Detection
            if (parentCandidate && node.type === 'mindmap' && parentCandidate.type === 'mindmap') {
                const absY = parentCandidate.position.y;
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
            if (newTargetId !== dragTargetIdRef.current || (typeof window !== 'undefined' && dropPosition !== (window as any)._lastMindmapDropPos)) {
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
                         if (typeof window !== 'undefined') {
                             (window as any)._lastMindmapDropPos = dropPosition;
                         }
                    } else if (typeof window !== 'undefined') {
                         (window as any)._lastMindmapDropPos = null;
                    }
                }
                
                if (!newTargetId && typeof window !== 'undefined') {
                    (window as any)._lastMindmapDropPos = null;
                }

                dragTargetIdRef.current = newTargetId;
            }
        });
    }, [onSmartNodeDrag, setNodes]);

    const onNodeDragStop = useCallback((_e: React.MouseEvent, node: Node, allNodes: Node[]) => {
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
        const finalSnapDelta = typeof window !== 'undefined' ? (window as any)._lastActiveSnapDelta : null;
        if ((window as any)._lastActiveSnapDelta) {
            (window as any)._lastActiveSnapDelta = null;
        }

        setIsDragging(false);
        clearGuides();
        let targetId = dragTargetIdRef.current;

        if (!targetId) {
            const nodeCenterX = node.position.x + (node.measured?.width || node.width || 0) / 2;
            const nodeCenterY = node.position.y + (node.measured?.height || node.height || 0) / 2;

            const parentCandidate = allNodes.find(n => {
                if (n.id === node.id) return false;

                // [DDD] Mind Map Magnetic Target Candidate
                if (node.type === 'mindmap' && n.type === 'mindmap') {
                    const absX = n.position.x;
                    const absY = n.position.y;
                    const w = n.measured?.width || n.width || 0;
                    const h = n.measured?.height || n.height || 0;
                    const hitPadding = 20; // 增大磁性吸附范围
                    return nodeCenterX >= absX - hitPadding && nodeCenterX <= absX + w + hitPadding &&
                           nodeCenterY >= absY - hitPadding && nodeCenterY <= absY + h + hitPadding;
                }

                if (n.type !== 'titleGroup' && n.type !== 'subGroup' && n.type !== 'swimlane') return false;
                if (node.type === 'swimlane') return false;

                // 🆕 Calculate Absolute Position for nested nodes (like swimlane lanes)
                let absX = n.position.x;
                let absY = n.position.y;
                let currentParentId = n.parentId;
                while (currentParentId) {
                    const parentNode = allNodes.find(p => p.id === currentParentId);
                    if (parentNode) {
                        absX += parentNode.position.x;
                        absY += parentNode.position.y;
                        currentParentId = parentNode.parentId;
                    } else {
                        break;
                    }
                }

                const w = n.measured?.width || n.width || 0;
                const h = n.measured?.height || n.height || 0;

                return nodeCenterX >= absX && nodeCenterX <= absX + w &&
                    nodeCenterY >= absY && nodeCenterY <= absY + h;
            });

            targetId = parentCandidate?.id || null;
        }

        // 清理 CSS 高亮（使用 DOM 操作，避免触发 React 重新渲染）
        if (dragTargetIdRef.current) {
            const element = document.querySelector(`[data-id="${dragTargetIdRef.current}"]`);
            element?.classList.remove('drop-target-highlight');
        }
        dragTargetIdRef.current = null;

        const parentCandidate = targetId ? allNodes.find(n => n.id === targetId) : null;

        if (parentCandidate) {
            // [DDD] Mind Map Domain Event (Delegate reparenting to Orchestrator)
            if (node.type === 'mindmap' && parentCandidate.type === 'mindmap') {
                if (typeof window !== 'undefined') {
                    const finalPosition = (window as any)._lastMindmapDropPos || 'inside';
                    window.dispatchEvent(new CustomEvent('mindmap:reparent', {
                        detail: { nodeId: node.id, targetId: parentCandidate.id, position: finalPosition }
                    }));
                    (window as any)._lastMindmapDropPos = null;
                }
                return; // Stop standard Group parenting execution
            }

            // Parent Found!
            // 1. Check if already parented to this one to avoid churn
            if (node.parentId === parentCandidate.id) return;

            setNodes((nds) => {
                const CONTAINER_PADDING = 24;
                // 🆕 Calculate Absolute Position of parentCandidate
                let parentAbsX = parentCandidate.position.x;
                let parentAbsY = parentCandidate.position.y;
                let currentParentId = parentCandidate.parentId;
                while (currentParentId) {
                    const parentNode = nds.find(p => p.id === currentParentId);
                    if (parentNode) {
                        parentAbsX += parentNode.position.x;
                        parentAbsY += parentNode.position.y;
                        currentParentId = parentNode.parentId;
                    } else {
                        break;
                    }
                }

                // Calculate the child's absolute position
                let absX = node.position.x;
                let absY = node.position.y;
                if (node.parentId) {
                    const oldParent = nds.find(p => p.id === node.parentId);
                    if (oldParent) {
                        // Compute oldParent absolute position
                        let oldParentAbsX = oldParent.position.x;
                        let oldParentAbsY = oldParent.position.y;
                        let oldParentCurrentId = oldParent.parentId;
                        while (oldParentCurrentId) {
                            const pNode = nds.find(p => p.id === oldParentCurrentId);
                            if (pNode) {
                                oldParentAbsX += pNode.position.x;
                                oldParentAbsY += pNode.position.y;
                                oldParentCurrentId = pNode.parentId;
                            } else {
                                break;
                            }
                        }
                        absX += oldParentAbsX;
                        absY += oldParentAbsY;
                    }
                }

                // Child's new relative position inside parent
                const childRelX = absX - parentAbsX;
                const childRelY = absY - parentAbsY;
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
                        const oldParent = allNodes.find(p => p.id === node.parentId);
                        let absX = node.position.x;
                        let absY = node.position.y;
                        if (oldParent) {
                            let oldParentAbsX = oldParent.position.x;
                            let oldParentAbsY = oldParent.position.y;
                            let oldParentCurrentId = oldParent.parentId;
                            while (oldParentCurrentId) {
                                const pNode = nds.find(p => p.id === oldParentCurrentId);
                                if (pNode) {
                                    oldParentAbsX += pNode.position.x;
                                    oldParentAbsY += pNode.position.y;
                                    oldParentCurrentId = pNode.parentId;
                                } else {
                                    break;
                                }
                            }
                            absX += oldParentAbsX;
                            absY += oldParentAbsY;
                        }

                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { parentId: _p, extent: _e, ...rest } = n; // Remove parentId/extent
                        return {
                            ...rest,
                            position: { 
                                x: absX + (finalSnapDelta ? finalSnapDelta.x : 0), 
                                y: absY + (finalSnapDelta ? finalSnapDelta.y : 0) 
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
    }, [setIsDragging, setNodes, clearGuides]);

    return {
        onDragOver,
        onDrop,
        onNodeDragStart,
        onNodeDrag,
        onNodeDragStop
    };
};
