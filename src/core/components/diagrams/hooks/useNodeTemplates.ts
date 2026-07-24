import { useState, useCallback, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import {
    coerceNodeTemplate,
    coerceNodeTemplates,
    readNodeTemplates,
    writeNodeTemplates,
} from '../../../utils/nodeTemplateStorage';

export interface NodeTemplate {
    id: string;
    name: string;
    /** 用于侧边栏分类显示 */
    category: string;
    /** 保存的节点数据（不含 id/position） */
    nodeType: string;
    data: Record<string, unknown>;
    style?: Record<string, unknown>;
    createdAt: number;
    /** 多节点组模板：包含子节点列表 */
    nodes?: Array<{ type: string; data: Record<string, unknown>; style?: Record<string, unknown>; relativeX: number; relativeY: number }>;
    /** 多节点组模板：包含连线列表（使用 index 引用 nodes 数组） */
    edges?: Array<{ sourceIndex: number; targetIndex: number; label?: string; type?: string; data?: Record<string, unknown> }>;
    /** 标记是否为组模板 */
    isGroup?: boolean;
}

/**
 * 节点模板管理 Hook
 * - 保存选中节点为模板
 * - 从模板创建新节点
 * - 删除/重命名模板
 * - localStorage 持久化
 */
export const useNodeTemplates = (activeLayerId: string = 'layer-0') => {
    const [templates, setTemplates] = useState<NodeTemplate[]>(readNodeTemplates);

    // 持久化
    useEffect(() => {
        writeNodeTemplates(templates);
    }, [templates]);

    /** 从节点保存为模板 */
    const saveAsTemplate = useCallback((node: Node, name: string, category: string = '我的模板') => {
        const data = { ...(node.data as Record<string, unknown>) };
        // 清理不需要持久化的运行时字段
        delete data.layer;

        const template = coerceNodeTemplate({
            id: `tpl-${Date.now()}`,
            name,
            category,
            nodeType: node.type || 'flowchart',
            data,
            style: node.style ? { ...node.style } : undefined,
            createdAt: Date.now(),
        });
        if (!template) return null;
        setTemplates(prev => [...prev, template]);
        return template;
    }, []);

    /** 从模板创建节点和连线数据 */
    const createFromTemplate = useCallback((template: NodeTemplate, viewportX: number, viewportY: number, _viewportZoom: number): { nodes: Node[]; edges: Edge[] } => {
        const safeTemplate = coerceNodeTemplate(template);
        if (!safeTemplate) return { nodes: [], edges: [] };

        if (safeTemplate.isGroup && safeTemplate.nodes) {
            const baseId = `group-${Date.now()}`;
            // 批量创建节点
            const newNodes: Node[] = safeTemplate.nodes.map((n, i) => ({
                id: `${baseId}-${i}`,
                type: n.type,
                position: { 
                    x: viewportX + n.relativeX, 
                    y: viewportY + n.relativeY 
                },
                data: { ...n.data, layer: activeLayerId },
                style: n.style ? { ...n.style } : undefined,
            }));

            // 批量创建连线
            const newEdges: Edge[] = (safeTemplate.edges || []).map((e, i) => ({
                id: `edge-${baseId}-${i}`,
                source: `${baseId}-${e.sourceIndex}`,
                target: `${baseId}-${e.targetIndex}`,
                label: e.label,
                type: e.type,
                data: e.data ? { ...e.data } : undefined,
            }));

            return { nodes: newNodes, edges: newEdges };
        }

        // 单节点模板
        return {
            nodes: [{
                id: `node-${Date.now()}`,
                type: safeTemplate.nodeType,
                position: { x: viewportX, y: viewportY },
                data: { ...safeTemplate.data, layer: activeLayerId },
                style: safeTemplate.style ? { ...safeTemplate.style } : undefined,
            }],
            edges: []
        };
    }, [activeLayerId]);

    /** 删除模板 */
    const deleteTemplate = useCallback((templateId: string) => {
        setTemplates(prev => prev.filter(t => t.id !== templateId));
    }, []);

    /** 重命名模板 */
    const renameTemplate = useCallback((templateId: string, name: string) => {
        setTemplates(prev => coerceNodeTemplates(prev.map(t => t.id === templateId ? { ...t, name } : t)));
    }, []);

    /** 按 category 分组 */
    const groupedTemplates = templates.reduce<Record<string, NodeTemplate[]>>((acc, tpl) => {
        (acc[tpl.category] ||= []).push(tpl);
        return acc;
    }, {});

    /** 保存多节点组为模板 */
    const saveGroupAsTemplate = useCallback((selectedNodes: Node[], relatedEdges: Array<{ source: string; target: string; label?: string; type?: string; data?: unknown }>, name: string, category: string = '自定义组件') => {
        if (selectedNodes.length === 0) return null;

        // 计算最小包围盒，以第一个节点为基准计算相对位置
        const minX = Math.min(...selectedNodes.map(n => n.position.x));
        const minY = Math.min(...selectedNodes.map(n => n.position.y));

        // 创建 ID → index 映射
        const idToIndex = new Map(selectedNodes.map((n, i) => [n.id, i]));

        const groupNodes = selectedNodes.map(n => ({
            type: n.type || 'flowchart',
            data: { ...(n.data as Record<string, unknown>), layer: undefined },
            style: n.style ? { ...n.style } : undefined,
            relativeX: n.position.x - minX,
            relativeY: n.position.y - minY,
        }));

        const groupEdges = relatedEdges
            .filter(e => idToIndex.has(e.source) && idToIndex.has(e.target))
            .map(e => ({
                sourceIndex: idToIndex.get(e.source)!,
                targetIndex: idToIndex.get(e.target)!,
                label: typeof e.label === 'string' ? e.label : undefined,
                type: e.type,
                data: e.data ? { ...e.data } : undefined,
            }));

        const firstNode = selectedNodes[0];
        const template = coerceNodeTemplate({
            id: `tpl-${Date.now()}`,
            name,
            category,
            nodeType: firstNode.type || 'flowchart',
            data: { ...(firstNode.data as Record<string, unknown>) },
            style: firstNode.style ? { ...firstNode.style } : undefined,
            createdAt: Date.now(),
            nodes: groupNodes,
            edges: groupEdges,
            isGroup: true,
        });
        if (!template) return null;
        setTemplates(prev => [...prev, template]);
        return template;
    }, []);

    return {
        templates,
        groupedTemplates,
        saveAsTemplate,
        saveGroupAsTemplate,
        createFromTemplate,
        deleteTemplate,
        renameTemplate,
    };
};
