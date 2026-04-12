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

        const buildNode = (nodeId: string): DataNode => {
            const node = nodes.find(n => n.id === nodeId);
            // Support simple text fallback if label is complex HTML, or just strip tags
            
            // Note: Since React Flow nodes might store HTML in label, 
            // for outline purposes we might want to strip HTML or parse it.
            // But we can just render the raw string for simplicity if it's mostly text.
            let rawTitle = (node?.data?.label as string) || 'Untitled';
            
            // Simple HTML tag stripper for safe tree rendering
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
