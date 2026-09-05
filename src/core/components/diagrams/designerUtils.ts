
import { Node, Edge, MarkerType, Position } from '@xyflow/react';
import type { CSSProperties } from 'react';
import { StandardDiagramData, StandardNodeData, StandardEdgeData, GroupNodeData } from '../../models/DiagramModels';
import { LayoutType, type LayoutOptions } from '../../types/layout';
import { getThemeManager } from '../../themes/EnhancedThemeManagerRefactored';
import { isSafeCssColor } from '../../themes/themeImportSecurity';
import { appendBaseReactFlowEdgeSemanticClassName } from '../shared/baseReactFlowEdgePresentation';
import { downloadFile } from '../../utils/downloadUtils';
import { validateAndFixNodes } from '../../utils/nodeValidation';
import { expandHandle } from '../../routing/utils/handleUtils';
import {
    logDesignerUtilsDomainLayoutFailure,
    logDesignerUtilsMigrationFailure,
    logDesignerUtilsThemeRestoreFailure,
} from './designerUtilsLogging';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const optionalString = (value: unknown): string | undefined => (
    typeof value === 'string' ? value : undefined
);

const resolveCanvasPosition = (value: unknown, fallback: Node['position']): Node['position'] => {
    if (!isRecord(value)) return fallback;
    return typeof value.x === 'number' && Number.isFinite(value.x)
        && typeof value.y === 'number' && Number.isFinite(value.y)
        ? { x: value.x, y: value.y }
        : fallback;
};

const resolveCanvasStyle = (value: unknown): CSSProperties => (
    isRecord(value) ? value as CSSProperties : {}
);

const optionalLayoutType = (value: unknown): LayoutType | undefined => (
    typeof value === 'string' && (Object.values(LayoutType) as string[]).includes(value)
        ? value as LayoutType
        : undefined
);

const resolveRestorableThemeId = (themeId?: string): string | undefined => {
    if (!themeId || themeId === 'manual') return undefined;
    const themeManager = getThemeManager();
    const availableThemeIds = new Set(themeManager.getAvailableThemeIds?.() || []);
    return availableThemeIds.has(themeId) ? themeId : undefined;
};

const MIND_MAP_META_NODE_ID = '__mindmap_meta__';

const coerceMindMapPersistenceNode = (value: unknown): Node | null => {
    if (!isRecord(value) || value.id !== MIND_MAP_META_NODE_ID || value.type !== 'mindmap' || value.hidden !== true) {
        return null;
    }
    const data = isRecord(value.data) ? value.data : null;
    const payload = data && isRecord(data.mindmapV2) ? data.mindmapV2 : null;
    if (!data || payload?._version !== 'mindmap-v2') return null;
    return {
        id: MIND_MAP_META_NODE_ID,
        type: 'mindmap',
        position: resolveCanvasPosition(value.position, { x: -9999, y: -9999 }),
        hidden: true,
        data,
    };
};

const resolveGeneratedGroupLayoutOptions = (layout: StandardDiagramData['layout'] | undefined) => {
    return {
        generateDomainGroups: layout?.generateDomainGroups !== false,
        generateSubDomainGroups: layout?.generateSubDomainGroups !== false,
        domainWhitelist: Array.isArray(layout?.domainWhitelist) ? layout.domainWhitelist : undefined,
        subDomainWhitelist: Array.isArray(layout?.subDomainWhitelist) ? layout.subDomainWhitelist : undefined,
    };
};

const restoreCanvasEdgePresentation = (edge: StandardEdgeData, edgeId: string) => {
    const semanticStroke = typeof edge.style?.stroke === 'string'
        && isSafeCssColor(edge.style.stroke)
        ? edge.style.stroke.trim()
        : undefined;
    return {
        id: edgeId,
        source: edge.source,
        target: edge.target,
        type: edge.type === 'main' ? 'advanced-smart-step' : (edge.type || 'advanced-smart-step'),
        className: appendBaseReactFlowEdgeSemanticClassName(undefined, edge.type),
        label: edge.label,
        markerEnd: edge.markerEnd ?? {
            type: MarkerType.ArrowClosed,
            ...(semanticStroke ? { color: semanticStroke } : {}),
        },
        style: edge.style,
    };
};

export type StandardDataToCanvasOptions = {
    edgeRoutingQuality?: 'full' | 'interactive';
};

const stripHiddenCanvasNodes = (nodes: Node[]): Node[] => (
    nodes.filter(node => (
        coerceMindMapPersistenceNode(node) !== null
        || !(node.hidden === true || (isRecord(node.data) && node.data.hidden === true))
    ))
);

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
        const nodeData = isRecord(node.data) ? node.data : {};

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
        const rawLabel = optionalString(nodeData.label) || '';
        const description = optionalString(nodeData.description) || `<b>${rawLabel}</b>`;

        const baseProps = {
            id: node.id,
            description: description,
            // Domain mapping: Use strict domain prop, fallback to domainClass, fallback to 'core'
            domain: optionalString(nodeData.domain) || optionalString(nodeData.domainClass) || '业务域',
            subDomain: optionalString(nodeData.subDomain),
            domainClass: optionalString(nodeData.domainClass) || 'core',
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
                themeColor: optionalString(nodeData.themeColor), // Persist themeColor
                data: nodeData // Store originals if needed
            } satisfies GroupNodeData);
        } else {
            standardNodes.push({
                ...baseProps,
                id: node.id,
                // Ensure mandatory fields
                domain: baseProps.domain,
                domainClass: baseProps.domainClass,
            } satisfies StandardNodeData);
        }
    });

    // Map Edges
    const standardEdges: StandardEdgeData[] = edges.map(edge => {
        const edgeData = isRecord(edge.data) ? edge.data : {};
        return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: (edge.type === 'smart-step' || edge.type === 'smart') ? 'main' : edge.type || 'main',
        label: optionalString(edge.label) || optionalString(edgeData.label),
        markerEnd: edge.markerEnd, // Persist markers
        style: edge.style, // Persist styles (dashed etc)
        ...(edgeData.constraints !== undefined ? { data: { constraints: edgeData.constraints } } : {}),
        // Persist extra canvas data in metadata
        metadata: {
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            autoHandles: edgeData.auto,
            manualHandles: edgeData.manualHandles === true,
            manualHandleSides: edgeData.manualHandleSides
        }
    };
    });

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
        const pureNode: StandardNodeData = {
            id: n.id,
            description: n.description,
            domain: n.domain,
            domainClass: n.domainClass,
            type: n.type
        };
        
        if (n.subDomain) {
            pureNode.subDomain = n.subDomain;
        }

        // Only keep business sequence metadata
        if (n.metadata?.sequence) {
            pureNode.metadata = { sequence: n.metadata.sequence };
        }
        
        return pureNode as StandardNodeData;
    });

    // Strip UI-specific noise from edges
    data.edges = data.edges.map(e => {
        const pureEdge: StandardEdgeData = {
            id: e.id,
            source: e.source,
            target: e.target,
            type: (e.type === 'smart-step' || e.type === 'smart' || e.type === 'advanced-smart-step') ? 'main' : e.type,
        };
        
        if (e.label) {
            pureEdge.label = e.label;
        }

        const constraintData = isRecord(e.data) ? e.data.constraints : undefined;
        if (constraintData) {
            pureEdge.data = { constraints: constraintData };
        }

        return pureEdge as StandardEdgeData;
    });

    return data;
};

import { PluginRegistry } from '../../services/PluginRegistry';
import { registerRoutingOnlyDocumentCandidate } from '../../routing/routingDocumentCandidateRegistry';

const finalizeStandardDataCanvasResult = (
    data: StandardDiagramData,
    nodes: Node[],
    edges: Edge[],
): { nodes: Node[]; edges: Edge[] } => {
    if (data.routingSnapshot) registerRoutingOnlyDocumentCandidate(data.routingSnapshot);
    return { nodes: stripHiddenCanvasNodes(nodes), edges };
};

/**
 * Converts StandardDiagramData back to React Flow nodes/edges for editing.
 * 
 * 对齐新项目 standardToGraphData：
 * - 有 canvasPosition 时：恢复保存的坐标
 * - 没有 canvasPosition 时：
 *   - 有多域（≥2）：调用 DomainDagreLayoutStrategy（含域容器生成+智能边路由）
 *   - 无多域：内部扁平 dagre 布局
 */
export const standardDataToCanvas = async (
    inputData: StandardDiagramData,
    pluginId?: string,
    options: StandardDataToCanvasOptions = {},
): Promise<{ nodes: Node[], edges: Edge[] }> => {
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
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', { detail: savedThemeId }));
        }
    }

    let nodes: Node[] = [];
    const edges: Edge[] = [];
    const { LayoutOptimizer } = await import('../layout/LayoutOptimizer');
    const optimizer = LayoutOptimizer.getInstance();

    // ═══ 检测是否有已保存坐标 ═══
    const hasCanvasPositions = Array.isArray(data.nodes) &&
        data.nodes.some((node) => isRecord(node.metadata) && isRecord(node.metadata.canvasPosition));

    // 1. Process Groups（仅在有 canvasPosition 时恢复）
    if (data.groups && hasCanvasPositions) {
        data.groups.forEach((g, idx) => {
            const metadata = isRecord(g.metadata) ? g.metadata : {};
            const label = g.label || (g.description ? g.description.replace(/<[^>]*>?/gm, '') : 'Group');
            nodes.push({
                id: g.id,
                type: 'titleGroup',
                position: resolveCanvasPosition(metadata.canvasPosition, { x: 0, y: idx * 300 }),
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
                    ...resolveCanvasStyle(metadata.style)
                },
                zIndex: -1
            });
        });
    }

    // 2. Process Nodes (包括提取 AI 可能输出的 group)
    const pendingGroupIds = new Set<string>();

    data.nodes.forEach((n, idx) => {
        const mindMapPersistenceNode = coerceMindMapPersistenceNode(n);
        if (mindMapPersistenceNode) {
            nodes.push(mindMapPersistenceNode);
            return;
        }
        const metadata = n.metadata || {};
        const persistedNodeData = isRecord(n.data) ? n.data : {};
        const metadataStyle = resolveCanvasStyle(metadata.style);
        const shape = optionalString(metadata.shape) || 'rectangle';
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
            toFiniteNumber(metadataStyle.width)
        );
        const contentHeight = Math.max(
            optimizer.calculateNodeHeight(description),
            toFiniteNumber(metadata.height),
            toFiniteNumber(metadataStyle.height)
        );

        // 如果明确是 group 类型，转化为 titleGroup 并直接放入
        if (n.type === 'group') {
            const rawWidth = contentWidth > 400 ? contentWidth : 400;
            const rawHeight = toFiniteNumber(metadata.height ?? n.height) || 300;
            nodes.push({
                id: n.id,
                type: 'titleGroup',
                // 让大纲尽量不叠在一块
                position: resolveCanvasPosition(metadata.canvasPosition, { x: -50, y: idx * 300 - 50 }),
                parentId: optionalString(metadata.parentId),
                data: {
                    label: label || 'Group',
                    description,
                    domain: n.domain,
                    domainClass: n.domainClass,
                    themeColor: n.themeColor
                },
                style: {
                    width: rawWidth,
                    height: rawHeight,
                    ...metadataStyle
                },
                zIndex: -1
            });
            return;
        }

        // 收集未明确声明的从属 parentId
        const parentId = n.parentId || optionalString(metadata.parentId);
        if (parentId) {
            pendingGroupIds.add(parentId);
        }

        nodes.push({
            id: n.id,
            type: n.type || 'flowchart',
            // 坐标：有保存坐标就用，没有就先设 (0,0) 让布局后算
            position: hasCanvasPositions
                ? resolveCanvasPosition(metadata.canvasPosition, { x: 100 + (idx % 5) * 150, y: 100 + Math.floor(idx / 5) * 100 })
                : { x: 0, y: 0 },
            parentId: n.parentId || (hasCanvasPositions ? optionalString(metadata.parentId) : undefined),
            extent: (n.parentId || (hasCanvasPositions && optionalString(metadata.parentId))) ? 'parent' as const : undefined,
            data: {
                ...persistedNodeData,
                label,
                description,
                domain: n.domain,
                domainClass: n.domainClass,
                subDomain: n.subDomain,
                shape,
                icon: metadata.icon,
                sequence: metadata.sequence,
                theme: metadata.theme
            },
            style: { ...metadataStyle, width: contentWidth, height: contentHeight },
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
        const restoredPresentation = restoreCanvasEdgePresentation(e, edgeId);
        const metadata = isRecord(e.metadata) ? e.metadata : {};
        const rawSource = rawNodeById.get(e.source);
        const rawTarget = rawNodeById.get(e.target);
        const sourceData = isRecord(rawSource?.data) ? rawSource.data : {};
        const targetData = isRecord(rawTarget?.data) ? rawTarget.data : {};
        const sourceDomain = rawSource?.domain ?? optionalString(sourceData.domain);
        const targetDomain = rawTarget?.domain ?? optionalString(targetData.domain);
        const sourceSubDomain = rawSource?.subDomain ?? optionalString(sourceData.subDomain);
        const targetSubDomain = rawTarget?.subDomain ?? optionalString(targetData.subDomain);
        const isCrossSubDomainEdge = Boolean(
            sourceDomain &&
            targetDomain &&
            sourceDomain === targetDomain &&
            sourceSubDomain &&
            targetSubDomain &&
            sourceSubDomain !== targetSubDomain
        );
        const explicitSourceHandle = e.sourceHandle ?? optionalString(metadata.sourceHandle);
        const explicitTargetHandle = e.targetHandle ?? optionalString(metadata.targetHandle);
        const sourceHandle = explicitSourceHandle ? expandHandle(String(explicitSourceHandle)) : (isCrossSubDomainEdge ? 'right' : undefined);
        const targetHandle = explicitTargetHandle ? expandHandle(String(explicitTargetHandle)) : (isCrossSubDomainEdge ? 'left' : undefined);
        const manualHandleSides = [
            ...(explicitSourceHandle ? ['source'] : []),
            ...(explicitTargetHandle ? ['target'] : []),
        ];
        const inferredSubDomainHandles = isCrossSubDomainEdge && !explicitSourceHandle && !explicitTargetHandle;
        if (hasCanvasPositions) {
            // 有保存坐标：使用保存的边数据
            const inferredAuto = Array.isArray(metadata.autoHandles)
                ? metadata.autoHandles.filter((value): value is string => typeof value === 'string')
                : ((metadata.manualHandles === true || manualHandleSides.length > 0) ? undefined : ((metadata.sourceHandle || metadata.targetHandle) ? ['source', 'target'] : undefined));
            edges.push({
                ...restoredPresentation,
                sourceHandle,
                targetHandle,
                data: {
                    auto: inferredAuto,
                    manualHandles: metadata.manualHandles === true,
                    manualHandleSides: metadata.manualHandleSides ?? (manualHandleSides.length > 0 ? manualHandleSides : undefined),
                    inferredSubDomainHandles
                },
            });
        } else {
            // 无保存坐标：也使用智能连线类型
            const direction = (data.layout?.direction === 'LR' || data.layout?.direction === 'RL') ? 'LR' : 'TB';
            const srcH = sourceHandle ?? (direction === 'LR' ? 'right' : 'bottom');
            const tgtH = targetHandle ?? (direction === 'LR' ? 'left' : 'top');
            edges.push({
                ...restoredPresentation,
                sourceHandle: srcH,
                targetHandle: tgtH,
                data: manualHandleSides.length > 0 ? { manualHandleSides, auto: [], inferredSubDomainHandles } : undefined,
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
                const layoutType = String(data.layout?.type || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
                const usesVerticalStrategy = layoutType === 'domainvertical' || layoutType === 'domainverticallayout';
                const usesHorizontalStrategy = layoutType === 'domainhorizontal' || layoutType === 'domainhorizontallayout';
                const strategy = usesVerticalStrategy
                    ? new (await import('../../strategies/DomainVerticalLayoutStrategy')).DomainVerticalLayoutStrategy()
                    : usesHorizontalStrategy
                        ? new (await import('../../strategies/DomainHorizontalLayoutStrategy')).DomainHorizontalLayoutStrategy()
                        : new (await import('../../strategies/DomainDagreLayoutStrategy')).DomainDagreLayoutStrategy();
                const layoutRecord = data.layout as unknown as Record<string, unknown>;
                const nodeLayout = optionalLayoutType(layoutRecord.nodeLayout)
                    ?? ((usesVerticalStrategy || usesHorizontalStrategy) ? 'vertical' : undefined);
                const layoutOptions: LayoutOptions = {
                    type: LayoutType.DOMAIN_FIRST,
                    direction: direction as 'TB' | 'LR',
                    ...(nodeLayout ? { nodeLayout: optionalLayoutType(nodeLayout) } : {}),
                    spacing: data.layout?.spacing || { horizontal: 50, vertical: 50 },
                    padding: { top: 40, right: 20, bottom: 20, left: 20 },
                    ...resolveGeneratedGroupLayoutOptions(data.layout),
                    ...(options.edgeRoutingQuality ? { edgeRoutingQuality: options.edgeRoutingQuality } : {}),
                    fitDomainContent: true,
                    domainOrder: data.layout?.domainOrder,
                    subDomainOrder: data.layout?.subDomainOrder,
                };
                const result = await strategy.calculateLayout(nodes, edges, layoutOptions);
                return finalizeStandardDataCanvasResult(data, result.nodes,
                    // [FIX] 若布局策略返回空 edges（例如所有 source/target 均不在 idMap 中），
                    // 回退到原始 edges，避免模版连线被意外丢失。
                    (result.edges && result.edges.length > 0) ? result.edges : edges,
                );
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
            const w = node.width || 150;
            const h = node.height || 50;
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
            const w = node.width || 150;
            const h = node.height || 50;
            node.position = { x: pos.x - w / 2, y: pos.y - h / 2 };
            node.targetPosition = isHorizontal ? Position.Left : Position.Top;
            node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
        }

    }

    return finalizeStandardDataCanvasResult(data, nodes, edges);
};

/**
 * Downloads a JSON object as a file
 */
export const downloadJson = (data: object, filename: string) => {
    const jsonStr = JSON.stringify(data, null, 2);
    downloadFile(jsonStr, filename, 'application/json');
};
