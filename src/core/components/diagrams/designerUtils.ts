
import { Node, Edge, MarkerType, Position } from '@xyflow/react';
import { StandardDiagramData, StandardNodeData, StandardEdgeData, GroupNodeData } from '../../models/DiagramModels';
import { getThemeManager } from '../../themes';
import { downloadFile } from '../../utils/downloadUtils';
import { validateAndFixNodes } from '../../utils/nodeValidation';
import { expandHandle } from '../../routing/utils/handleUtils';
import {
    logDesignerUtilsDomainLayoutFailure,
    logDesignerUtilsMigrationFailure,
    logDesignerUtilsThemeRestoreFailure,
} from './designerUtilsLogging';

const resolveRestorableThemeId = (themeId?: string): string | undefined => {
    if (!themeId || themeId === 'manual') return undefined;
    const themeManager = getThemeManager();
    const availableThemeIds = new Set(themeManager.getAvailableThemeIds?.() || []);
    return availableThemeIds.has(themeId) ? themeId : undefined;
};

/**
 * Converts React Flow canvas data into the application's StandardDiagramData format.
 * Strictly follows STANDARD_DIAGRAM_DATA_AI_GUIDE.md
 */
export const canvasToStandardData = (
    nodes: Node[],
    edges: Edge[],
    diagramName: string = 'Manual Flowchart'
): StandardDiagramData => {

    const groups: GroupNodeData[] = [];
    const standardNodes: StandardNodeData[] = [];

    nodes.forEach(node => {
        const isGroup = node.type === 'titleGroup' || node.type === 'subGroup';
        const nodeData = (node.data || {}) as any; // 兜底：防止 data 为 undefined

        // Basic Metadata for positioning restoration
        const canvasMetadata = {
            canvasPosition: node.position,
            width: node.measured?.width ?? node.width ?? 100,
            height: node.measured?.height ?? node.height ?? 50,
            parentId: node.parentId,
            shape: nodeData.shape, // Persist shape for round-trip
            icon: nodeData.icon, // Now safe to serialize as it's a string ID
            style: node.style, // Persist style for border dashed etc
            theme: nodeData.theme // Persist manual theme
        };

        // Construct Description (HTML supported)
        // If user typed in label, we use that. 
        const rawLabel = nodeData.label as string || '';
        const description = (nodeData.description as string) || `<b>${rawLabel}</b>`;

        const baseProps = {
            id: node.id,
            description: description,
            // Domain mapping: Use strict domain prop, fallback to domainClass, fallback to 'core'
            domain: (nodeData.domain as string) || (nodeData.domainClass as string) || '业务域',
            subDomain: (nodeData.subDomain as string) || undefined,
            domainClass: (nodeData.domainClass as string) || 'core',
            type: 'custom', // Fixed value as per guide
            metadata: {
                ...canvasMetadata,
                sequence: nodeData.sequence || '1'
            }
        };

        if (isGroup) {
            groups.push({
                ...baseProps,
                id: node.id,
                type: 'group', // Internal type for data model
                label: rawLabel,
                isGroup: true,
                measured: { width: canvasMetadata.width, height: canvasMetadata.height },
                position: node.position, // Keep for type compat, but metadata.canvasPosition is source of truth
                themeColor: nodeData.themeColor, // Persist themeColor
                data: nodeData // Store originals if needed
            } as any as GroupNodeData); // Cast due to strict type differences
        } else {
            standardNodes.push({
                ...baseProps,
                id: node.id,
                // Ensure mandatory fields
                domain: baseProps.domain,
                domainClass: baseProps.domainClass,
            } as any as StandardNodeData);
        }
    });

    // Map Edges
    const standardEdges: StandardEdgeData[] = edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: (edge.type === 'smart-step' || edge.type === 'smart') ? 'main' : (edge.type as any) || 'main',
        label: (edge.label as string) || (edge.data?.label as string),
        markerEnd: edge.markerEnd, // Persist markers
        style: edge.style, // Persist styles (dashed etc)
        // Persist extra canvas data in metadata
        metadata: {
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            autoHandles: (edge.data as any)?.auto,
            manualHandles: Boolean((edge.data as any)?.manualHandles),
            manualHandleSides: (edge.data as any)?.manualHandleSides
        }
    }));

    // 获取当前活动主题
    const currentTheme = getThemeManager().getCurrentTheme();

    return {
        id: `diagram-${Date.now()}`,
        name: diagramName,
        type: 'architecture', // Fixed type per guide
        version: '1.0.0',
        metadata: {
            title: diagramName,
            createdAt: new Date().toISOString(),
            author: 'User (Manual)',
            tags: ['manual-export'],
            themeId: currentTheme?.id || 'light'
        },
        layout: {
            type: 'custom',
            direction: 'LR',
            autoDirection: true,
            fitDomainContent: true,
            spacing: { horizontal: 50, vertical: 50 },
            padding: { horizontal: 20, vertical: 20, top: 20, bottom: 20, left: 20, right: 20 }
        },
        theme: {
            name: currentTheme?.id || 'manual',
            displayName: currentTheme?.name || 'Manual Theme',
            domains: {},
            isCustom: true
        },
        nodes: standardNodes,
        edges: standardEdges,
        groups: groups
    };
};

/**
 * Converts React Flow canvas data into a Pure StandardData format (For AI / Smart Layout)
 * Strips out UI constraints, coordinates, groups, sizing, and handles.
 */
export const canvasToPureStandardData = (
    nodes: Node[],
    edges: Edge[],
    diagramName: string = 'Flowchart Export'
): StandardDiagramData => {
    const data = canvasToStandardData(nodes, edges, diagramName);

    // Remove groups completely for pure logic handling
    delete data.groups;

    // Filter and strip UI-specific noise from nodes
    data.nodes = data.nodes.map(n => {
        const pureNode: any = {
            id: n.id,
            description: n.description,
            domain: n.domain,
            domainClass: n.domainClass,
            type: n.type
        };
        
        if ((n as any).subDomain) {
            pureNode.subDomain = (n as any).subDomain;
        }

        // Only keep business sequence metadata
        if (n.metadata?.sequence) {
            pureNode.metadata = { sequence: n.metadata.sequence };
        }
        
        return pureNode as StandardNodeData;
    });

    // Strip UI-specific noise from edges
    data.edges = data.edges.map(e => {
        const pureEdge: any = {
            id: e.id,
            source: e.source,
            target: e.target,
            type: (e.type === 'smart-step' || e.type === 'smart' || e.type === 'advanced-smart-step') ? 'main' : e.type,
        };
        
        if (e.label) {
            pureEdge.label = e.label;
        }

        const constraintData = (e as any).data?.constraints;
        if (constraintData) {
            (pureEdge as any).data = { constraints: constraintData };
        }

        return pureEdge as StandardEdgeData;
    });

    return data;
};

import { PluginRegistry } from '../../services/PluginRegistry';

/**
 * Converts StandardDiagramData back to React Flow nodes/edges for editing.
 * 
 * 对齐新项目 standardToGraphData：
 * - 有 canvasPosition 时：恢复保存的坐标
 * - 没有 canvasPosition 时：
 *   - 有多域（≥2）：调用 DomainDagreLayoutStrategy（含域容器生成+智能边路由）
 *   - 无多域：内部扁平 dagre 布局
 */
export const standardDataToCanvas = async (inputData: StandardDiagramData, pluginId?: string): Promise<{ nodes: Node[], edges: Edge[] }> => {
    // ---- [Plugin Migration Pipeline] ----
    // Derive the target plugin id: specified pluginId > inputData.type > default 'flowchart'
    const targetPluginId = pluginId || inputData.type || 'flowchart';
    const plugin = PluginRegistry.getInstance().getPlugin(targetPluginId);
    let data = inputData;
    
    // Execute data migration if a valid plugin provides versioining & migration logic
    if (plugin && plugin.version && plugin.migrate) {
        if (!data.version || data.version !== plugin.version) {
            try {
                data = (await plugin.migrate(data, data.version)) as StandardDiagramData;
                data.version = plugin.version; // Mark as migrated
            } catch (err) {
                logDesignerUtilsMigrationFailure(targetPluginId, err);
            }
        }
    }
    // -------------------------------------

    // 尝试恢复保存的主题
    const savedThemeId = resolveRestorableThemeId(data.metadata?.themeId || data.theme?.name);
    if (savedThemeId) {
        getThemeManager().setTheme(savedThemeId).catch((error) => {
            logDesignerUtilsThemeRestoreFailure(savedThemeId, error);
        });
        window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', { detail: savedThemeId }));
    }

    let nodes: Node[] = [];
    const edges: Edge[] = [];
    const { LayoutOptimizer } = await import('../layout/LayoutOptimizer');
    const optimizer = LayoutOptimizer.getInstance();

    // ═══ 检测是否有已保存坐标 ═══
    const hasCanvasPositions = Array.isArray(data.nodes) &&
        data.nodes.some((n: any) => n.metadata?.canvasPosition);

    // 1. Process Groups（仅在有 canvasPosition 时恢复）
    if (data.groups && hasCanvasPositions) {
        data.groups.forEach((g, idx) => {
            const label = g.label || (g.description ? g.description.replace(/<[^>]*>?/gm, '') : 'Group');
            nodes.push({
                id: g.id,
                type: 'titleGroup',
                position: g.metadata?.canvasPosition || { x: 0, y: idx * 300 },
                data: {
                    label,
                    description: g.description,
                    domain: g.domain,
                    domainClass: g.domainClass,
                    themeColor: g.themeColor
                },
                style: {
                    width: (g.measured?.width || 400),
                    height: (g.measured?.height || 300),
                    ...(g.metadata?.style || {})
                },
                zIndex: -1
            });
        });
    }

    // 2. Process Nodes (包括提取 AI 可能输出的 group)
    const pendingGroupIds = new Set<string>();

    data.nodes.forEach((n, idx) => {
        const metadata = n.metadata || {};
        const shape = metadata.shape || 'rectangle';
        const description = n.description || '';
        const titleMatch = description.match(/<b>(.*?)<\/b>/);
        const label = titleMatch ? titleMatch[1] : description.replace(/<[^>]*>?/gm, '').substring(0, 20);

        const toFiniteNumber = (value: unknown) => {
            const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };
        const contentWidth = Math.max(
            optimizer.calculateNodeWidth(description),
            toFiniteNumber(metadata.width),
            toFiniteNumber((metadata.style as any)?.width)
        );
        const contentHeight = Math.max(
            optimizer.calculateNodeHeight(description),
            toFiniteNumber(metadata.height),
            toFiniteNumber((metadata.style as any)?.height)
        );

        // 如果明确是 group 类型，转化为 titleGroup 并直接放入
        if (n.type === 'group' || (n as any).type === 'group') {
            const rawWidth = contentWidth > 400 ? contentWidth : 400;
            const rawHeight = metadata.height || (n as any).height || 300;
            nodes.push({
                id: n.id,
                type: 'titleGroup',
                // 让大纲尽量不叠在一块
                position: metadata.canvasPosition || { x: -50, y: idx * 300 - 50 },
                parentId: metadata.parentId,
                data: {
                    label: label || 'Group',
                    description,
                    domain: n.domain,
                    domainClass: n.domainClass,
                    themeColor: (n as any).themeColor
                },
                style: {
                    width: rawWidth,
                    height: rawHeight,
                    ...(metadata.style || {})
                },
                zIndex: -1
            });
            return;
        }

        // 收集未明确声明的从属 parentId
        if (n.parentId || metadata.parentId) {
            pendingGroupIds.add(n.parentId || metadata.parentId);
        }

        nodes.push({
            id: n.id,
            type: n.type || 'flowchart',
            // 坐标：有保存坐标就用，没有就先设 (0,0) 让布局后算
            position: hasCanvasPositions
                ? (metadata.canvasPosition || { x: 100 + (idx % 5) * 150, y: 100 + Math.floor(idx / 5) * 100 })
                : { x: 0, y: 0 },
            parentId: n.parentId || (hasCanvasPositions ? metadata.parentId : undefined),
            extent: (n.parentId || (hasCanvasPositions && metadata.parentId)) ? 'parent' as const : undefined,
            data: {
                label,
                description,
                domain: n.domain,
                domainClass: n.domainClass,
                subDomain: (n as any).subDomain,
                shape,
                icon: metadata.icon,
                sequence: metadata.sequence,
                theme: metadata.theme
            },
            style: { ...metadata.style, width: contentWidth, height: contentHeight },
            width: contentWidth,
            height: contentHeight,
            measured: { width: contentWidth, height: contentHeight }
        });
    });

    // 2.5 Auto-generate missing parent groups (AI 容错兜底：有 parentId 却没声明本体)
    pendingGroupIds.forEach(pid => {
        if (!nodes.some(n => n.id === pid)) {
            nodes.push({
                id: pid,
                type: 'titleGroup',
                position: { x: -50, y: -50 },
                data: {
                    label: pid,  // 用 ID 名字兜底
                    description: `Auto-generated container for ${pid}`,
                    domainClass: 'core'
                },
                style: { width: 400, height: 300 },
                zIndex: -1
            });
        }
    });

    // 2.8 Validate and fix node dimensions/positions before layout
    nodes = validateAndFixNodes(nodes);

    const rawNodeById = new Map(data.nodes.map(n => [n.id, n]));

    // 3. Process Edges
    data.edges.forEach(e => {
        const edgeId = e.id || `e-${e.source}-${e.target}-${Math.random().toString(36).substring(2,9)}`;
        const edgeAny = e as any;
        const rawSource = rawNodeById.get(e.source) as any;
        const rawTarget = rawNodeById.get(e.target) as any;
        const sourceDomain = rawSource?.domain ?? rawSource?.data?.domain;
        const targetDomain = rawTarget?.domain ?? rawTarget?.data?.domain;
        const sourceSubDomain = rawSource?.subDomain ?? rawSource?.data?.subDomain;
        const targetSubDomain = rawTarget?.subDomain ?? rawTarget?.data?.subDomain;
        const isCrossSubDomainEdge = Boolean(
            sourceDomain &&
            targetDomain &&
            sourceDomain === targetDomain &&
            sourceSubDomain &&
            targetSubDomain &&
            sourceSubDomain !== targetSubDomain
        );
        const explicitSourceHandle = edgeAny.sourceHandle ?? edgeAny.metadata?.sourceHandle;
        const explicitTargetHandle = edgeAny.targetHandle ?? edgeAny.metadata?.targetHandle;
        const sourceHandle = explicitSourceHandle ? expandHandle(String(explicitSourceHandle)) : (isCrossSubDomainEdge ? 'right' : undefined);
        const targetHandle = explicitTargetHandle ? expandHandle(String(explicitTargetHandle)) : (isCrossSubDomainEdge ? 'left' : undefined);
        const manualHandleSides = [
            ...(explicitSourceHandle ? ['source'] : []),
            ...(explicitTargetHandle ? ['target'] : []),
        ];
        const inferredSubDomainHandles = isCrossSubDomainEdge && !explicitSourceHandle && !explicitTargetHandle;
        if (hasCanvasPositions) {
            // 有保存坐标：使用保存的边数据
            const edgeType = e.type === 'main' ? 'advanced-smart-step' : (e.type || 'advanced-smart-step');
            const inferredAuto = Array.isArray(edgeAny.metadata?.autoHandles)
                ? edgeAny.metadata?.autoHandles
                : ((edgeAny.metadata?.manualHandles === true || manualHandleSides.length > 0) ? undefined : ((edgeAny.metadata?.sourceHandle || edgeAny.metadata?.targetHandle) ? ['source', 'target'] : undefined));
            edges.push({
                id: edgeId,
                source: e.source,
                target: e.target,
                type: edgeType,
                label: e.label,
                sourceHandle,
                targetHandle,
                data: {
                    auto: inferredAuto,
                    manualHandles: Boolean(edgeAny.metadata?.manualHandles),
                    manualHandleSides: edgeAny.metadata?.manualHandleSides ?? (manualHandleSides.length > 0 ? manualHandleSides : undefined),
                    inferredSubDomainHandles
                },
                markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed },
                style: e.style
            });
        } else {
            // 无保存坐标：也使用智能连线类型
            const direction = (data.layout?.direction === 'LR' || data.layout?.direction === 'RL') ? 'LR' : 'TB';
            const srcH = sourceHandle ?? (direction === 'LR' ? 'right' : 'bottom');
            const tgtH = targetHandle ?? (direction === 'LR' ? 'left' : 'top');
            const edgeType = e.type === 'main' ? 'advanced-smart-step' : (e.type || 'advanced-smart-step');
            edges.push({
                id: edgeId,
                source: e.source,
                target: e.target,
                type: edgeType,
                label: e.label,
                sourceHandle: srcH,
                targetHandle: tgtH,
                data: manualHandleSides.length > 0 ? { manualHandleSides, auto: [], inferredSubDomainHandles } : undefined,
                markerEnd: { type: MarkerType.ArrowClosed },
            });
        }
    });

    // ═══ 4. 内置布局（对齐新项目 standardToGraphData） ═══
    if (!hasCanvasPositions && nodes.length > 0) {
        const direction = (data.layout?.direction === 'LR' || data.layout?.direction === 'RL') ? 'LR' : 'TB';
        const isHorizontal = direction === 'LR';

        // ═══ 域检测（对齐新项目 hasMeaningfulDomains） ═══
        // 节点出现顺序仅用于判断是否存在多域；不要隐式生成 domainOrder。
        // domainOrder 是强布局约束，只应来自标准数据中的显式 layout.domainOrder。
        const implicitDomainOrder: string[] = [];
        for (const node of data.nodes) {
            const domain = String(node.domain || '').trim();
            if (!domain || domain === '默认域' || domain === 'default') continue;
            if (!implicitDomainOrder.includes(domain)) implicitDomainOrder.push(domain);
        }
        const domainSet = new Set(implicitDomainOrder);
        const hasDomains = domainSet.size >= 2;

        if (hasDomains) {
            // ═══ 有多域 → 按标准数据 layout.type 选择域策略；未声明时保持 DomainDagre 兼容默认 ═══
            try {
                const layoutType = String((data.layout as any)?.type || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
                const usesVerticalStrategy = layoutType === 'domainvertical' || layoutType === 'domainverticallayout';
                const usesHorizontalStrategy = layoutType === 'domainhorizontal' || layoutType === 'domainhorizontallayout';
                const strategy = usesVerticalStrategy
                    ? new (await import('../../strategies/DomainVerticalLayoutStrategy')).DomainVerticalLayoutStrategy()
                    : usesHorizontalStrategy
                        ? new (await import('../../strategies/DomainHorizontalLayoutStrategy')).DomainHorizontalLayoutStrategy()
                        : new (await import('../../strategies/DomainDagreLayoutStrategy')).DomainDagreLayoutStrategy();
                const nodeLayout = (data.layout as any)?.nodeLayout
                    ?? ((usesVerticalStrategy || usesHorizontalStrategy) ? 'vertical' : undefined);
                const result = await strategy.calculateLayout(nodes, edges, {
                    type: strategy.getName() as any,
                    direction: direction as 'TB' | 'LR',
                    ...(nodeLayout ? { nodeLayout } : {}),
                    spacing: data.layout?.spacing || { horizontal: 50, vertical: 50 },
                    padding: { top: 40, right: 20, bottom: 20, left: 20 },
                    generateDomainGroups: true,
                    generateSubDomainGroups: true,
                    fitDomainContent: true,
                    domainOrder: (data.layout as any)?.domainOrder,
                    subDomainOrder: (data.layout as any)?.subDomainOrder,
                } as any);
                return {
                    nodes: result.nodes,
                    // [FIX] 若布局策略返回空 edges（例如所有 source/target 均不在 idMap 中），
                    // 回退到原始 edges，避免模版连线被意外丢失。
                    edges: (result.edges && result.edges.length > 0) ? result.edges : edges
                };
            } catch (err) {
                logDesignerUtilsDomainLayoutFailure(err);
                // 回退到下面的扁平 dagre
            }
        }

        // ═══ 无多域 → 扁平 Dagre 布局 ═══
        const dagre = (await import('dagre')).default;
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({
            rankdir: direction,
            nodesep: 50,
            ranksep: 60,
        });

        const flowNodes = nodes.filter(n => n.type === 'flowchart');
        flowNodes.forEach(node => {
            const w = (node as any).width || 150;
            const h = (node as any).height || 50;
            dagreGraph.setNode(node.id, { width: w, height: h });
        });

        edges.forEach(edge => {
            if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
                dagreGraph.setEdge(edge.source, edge.target);
            }
        });

        dagre.layout(dagreGraph);

        for (const node of flowNodes) {
            const pos = dagreGraph.node(node.id);
            if (!pos) continue;
            const w = (node as any).width || 150;
            const h = (node as any).height || 50;
            node.position = { x: pos.x - w / 2, y: pos.y - h / 2 };
            (node as any).targetPosition = isHorizontal ? Position.Left : Position.Top;
            (node as any).sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
        }

    }

    return { nodes, edges };
};

/**
 * Downloads a JSON object as a file
 */
export const downloadJson = (data: object, filename: string) => {
    const jsonStr = JSON.stringify(data, null, 2);
    downloadFile(jsonStr, filename, 'application/json');
};
