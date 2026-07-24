import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import './SwimLaneNode.css';

// ---- Data Model ----

export interface SwimLaneNodeData {
    label: string;
    direction: 'horizontal' | 'vertical';
    laneCount?: number; // 创建时使用，运行时 Lane 由 titleGroup 子节点表示
    [key: string]: unknown;
}

// ---- Component ----

const SwimLaneNode: React.FC<NodeProps<Node<SwimLaneNodeData>>> = ({ id, data, selected }) => {
    const { setNodes, getNodes, getNode } = useReactFlow();
    const label = data.label || 'Swimlane';
    const direction = data.direction || 'horizontal';

    // Resize Logic
    const onResize = useCallback((_event: unknown, params: { width: number; height: number }) => {
        const { width, height } = params;
        const headerH = 36;
        const contentW = width;
        const contentH = Math.max(0, height - headerH);

        setNodes((nds: Node[]) => {
            const children = nds.filter((n: Node) => n.parentId === id);
            if (children.length === 0) return nds;

            const sortedChildren = [...children].sort((a, b) => {
                if (direction === 'horizontal') {
                    return a.position.y - b.position.y;
                } else {
                    return a.position.x - b.position.x;
                }
            });

            const count = sortedChildren.length;
            const laneW = direction === 'horizontal' ? contentW : Math.floor(contentW / count);
            const laneH = direction === 'horizontal' ? Math.floor(contentH / count) : contentH;

            const updates = new Map();
            sortedChildren.forEach((child, idx) => {
                const newX = direction === 'horizontal' ? 0 : idx * laneW;
                const newY = direction === 'horizontal' ? headerH + idx * laneH : headerH;

                updates.set(child.id, {
                    width: laneW,
                    height: laneH,
                    position: { x: newX, y: newY }
                });
            });

            return nds.map((n: Node) => {
                if (updates.has(n.id)) {
                    const update = updates.get(n.id);
                    if (n.style?.width === update.width &&
                        n.style?.height === update.height &&
                        n.position.x === update.position.x &&
                        n.position.y === update.position.y) {
                        return n;
                    }
                    return {
                        ...n,
                        style: { ...n.style, width: update.width, height: update.height },
                        position: update.position
                    };
                }
                return n;
            });
        });
    }, [id, direction, setNodes]);

    // Add Lane Logic
    const onAddLane = useCallback(() => {
        const allNodes = getNodes();
        const parentNode = getNode(id);
        if (!parentNode) return;

        const children = allNodes.filter(n => n.parentId === id);
        const count = children.length + 1;

        const newLaneId = `${id}-lane-${Date.now()}`;
        const newLane: Node = {
            id: newLaneId,
            type: 'titleGroup',
            position: { x: 0, y: 0 }, // Handled by refresh next
            parentId: id,
            extent: 'parent',
            data: {
                label: `新通道 ${count}`,
                description: `新通道 ${count}`,
                themeColor: '#8b5cf6',
                titleBarHeight: 28,
                layer: parentNode.data?.layer,
                isLane: true,
                domainClass: parentNode.data?.domainClass || 'core',
            },
            style: { width: 100, height: 100 }, // Dummy, resized immediately
            zIndex: -1,
        };

        const parentW = Number(parentNode.style?.width || 800);
        const parentH = Number(parentNode.style?.height || 500);

        setNodes(nds => {
            const ndsWithNew = nds.concat(newLane);
            
            // Re-run resizing to align them perfectly
            const cdt = ndsWithNew.filter(n => n.parentId === id);
            const sorted = [...cdt].sort((a, b) => {
                if (a.id === newLaneId) return 1; // Always push to end
                if (b.id === newLaneId) return -1;
                return direction === 'horizontal' ? a.position.y - b.position.y : a.position.x - b.position.x;
            });

            const headerH = 36;
            const laneW = direction === 'horizontal' ? parentW : Math.floor(parentW / count);
            const laneH = direction === 'horizontal' ? Math.floor((parentH - headerH) / count) : (parentH - headerH);

            return ndsWithNew.map(n => {
                if (n.parentId === id || n.id === newLaneId) {
                    const idx = sorted.findIndex(sn => sn.id === n.id);
                    return {
                        ...n,
                        style: { ...n.style, width: laneW, height: laneH },
                        position: {
                            x: direction === 'horizontal' ? 0 : idx * laneW,
                            y: direction === 'horizontal' ? headerH + idx * laneH : headerH
                        }
                    };
                }
                return n;
            });
        });

    }, [id, direction, getNodes, getNode, setNodes]);

    return (
        <div className={`swimlane-node ${selected ? 'selected' : ''}`}>
            {/* Resizer */}
            <NodeResizer
                minWidth={400}
                minHeight={250}
                maxWidth={2000}
                maxHeight={1200}
                color="#6366f1"
                isVisible={selected}
                handleClassName="swimlane-resize-handle"
                onResize={onResize}
            />

            {/* Header */}
            <div className="swimlane-header">
                <span className="swimlane-header-icon">🏊</span>
                <span className="swimlane-header-label">{label}</span>
            </div>

            {/* Content: titleGroup children rendered by React Flow via parentId */}
            <div className="swimlane-content" />

            {/* 🔥 Overlay Actions (Add Row/Col) */}
            <div 
                className={`swimlane-add-lane-btn ${direction}`} 
                onClick={onAddLane}
                title="添加新通道 (Add Lane)"
            >
                +
            </div>

            {/* Handles */}
            <Handle type="source" position={Position.Top} id="top" className="swimlane-handle" isConnectableStart isConnectableEnd />
            <Handle type="source" position={Position.Right} id="right" className="swimlane-handle" isConnectableStart isConnectableEnd />
            <Handle type="source" position={Position.Bottom} id="bottom" className="swimlane-handle" isConnectableStart isConnectableEnd />
            <Handle type="source" position={Position.Left} id="left" className="swimlane-handle" isConnectableStart isConnectableEnd />
        </div>
    );
};

export default memo(SwimLaneNode);
