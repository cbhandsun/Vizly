import React, { useMemo } from 'react';
import { Tree, Empty } from 'antd';
import { PluginContext } from '../../../types/plugin';
import type { DataNode } from 'antd/es/tree';

export const MindMapOutlinePanel: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { getNodes, getEdges, reactFlowInstance, setNodes } = ctx;
    // Use getters for stable references - components that need reactivity should subscribe to store
    const nodes = getNodes();
    const edges = getEdges();

    const treeData = useMemo(() => {
        // Find roots (depth 0, type mindmap)
        const roots = nodes.filter(n => n.type === 'mindmap' && n.data?.depth === 0);
        if (roots.length === 0) return [];

        const childrenMap = new Map<string, string[]>();
        const structureEdges = edges.filter(e => e.type !== 'relationshipEdge');

        for (const e of structureEdges) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
        }

        // [S-2] Pre-build nodeMap: O(N) once, so buildNode lookups are O(1) instead of O(N).
        // Without this, each buildNode call is O(N) via nodes.find(), making the full tree O(N²).
        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        const buildNode = (nodeId: string): DataNode => {
            const node = nodeMap.get(nodeId); // [S-2] O(1)
            let rawTitle = (node?.data?.label as string) || 'Untitled';
            const cleanTitle = rawTitle.replace(/<[^>]+>/g, '').trim() || 'Untitled';
            const childrenIds = childrenMap.get(nodeId) || [];
            return {
                title: cleanTitle,
                key: nodeId,
                children: childrenIds.map(childId => buildNode(childId))
            };
        };

        return roots.map(root => buildNode(root.id));
    }, [nodes, edges]);

    if (treeData.length === 0) {
        return <Empty description="暂无导图节点" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    const onSelect = (selectedKeys: React.Key[], info: any) => {
        if (selectedKeys.length > 0 && reactFlowInstance) {
            const nodeId = selectedKeys[0] as string;
            const node = ctx.getNodes().find(n => n.id === nodeId);
            
            if (node && node.measured?.width) {
                 // Zoom slightly into the structural focus
                 const w = node.measured.width;
                 const h = node.measured.height || 40;
                 reactFlowInstance.setCenter(node.position.x + w/2, node.position.y + h/2, { zoom: 1.15, duration: 600 });
            } else if (node) {
                 reactFlowInstance.setCenter(node.position.x, node.position.y, { zoom: 1.15, duration: 600 });
            }
            
            // Sync selection state to canvas natively
            setNodes(nds => nds.map(n => ({ 
                ...n, 
                selected: n.id === nodeId 
            })));
        }
    };

    // Calculate selected keys dynamically to highlight matching tree nodes
    const selectedKeys = useMemo(() => {
        return nodes.filter(n => n.selected).map(n => n.id);
    }, [nodes]);

    return (
        <div style={{ padding: '12px 8px', height: '100%', overflowY: 'auto' }}>
            <Tree
                showLine={{ showLeafIcon: false }}
                defaultExpandAll
                treeData={treeData}
                onSelect={onSelect}
                selectedKeys={selectedKeys}
                blockNode
            />
        </div>
    );
};
