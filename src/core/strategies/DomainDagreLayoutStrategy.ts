/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
import type { StandardNodeData } from '../models/DiagramModels';
import dagre from 'dagre';
import { ILayoutStrategy } from './LayoutStrategyManager';
import { decideEdgeRouting, separateParallelEdges, globalOptimizeEdgeRouting, bundleEdges, layerBasedEdgeRouting, optimizeEdgeLabelPositions, beautifyOrthogonalEdges, optimizeTreeBusRouting } from '../utils/HandlePicker';
import { routeEdgesWithELK } from '../utils/elkEdgeRouter';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import {
    applyDomainGrouping,
    applySubGrouping,
    assignChildrenToSubGroupsBySemantic,
    normalizeSubGroupDomainByChildren,
    normalizeMissingNodeSubDomainByDomain,
    ensureMeasuredForNodes,
    centerSubGroupsInDomain
} from '../utils/layoutUtils';

/**
 * 域级 Dagre 布局策略
 * 
 * 特点：
 * - 使用 Dagre 原生分层算法（专为 DAG 设计）
 * - 天然支持语义顺序（按节点输入顺序分配层级）
 * - 支持多种排序算法（network-simplex, tight-tree, longest-path）
 * - 最小化边交叉
 * 
 * 分层策略：
 * - 第一层：域级布局（基于跨域边的拓扑顺序）
 * - 第二层：域内子图单独布局
 */
export class DomainDagreLayoutStrategy implements ILayoutStrategy {
    getName(): string { return 'DomainDagreLayout'; }
    getCategory(): 'hierarchy' | 'node' { return 'hierarchy'; }
    getDescription(): string { return 'Dagre分层布局：语义顺序 + 最小边交叉'; }
    isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
        return Array.isArray(nodes) && nodes.length > 0;
    }

    async calculateLayout(
        nodes: ReactFlowNode[],
        edges: Edge[],
        options: LayoutOptions
    ): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
        console.log(`[DomainDagre] calculateLayout CALLED with ${nodes.length} nodes, ${edges.length} edges`);

        // ===== [CRITICAL FIX] 强制归一化 measured =====
        // React Flow 的 measured 属性是异步填充的，在不同渲染周期可能有不同值（或不存在）。
        // 这导致 layoutUtils.ts 中 177+ 处使用 `measured?.width ?? style?.width` 的代码产生不一致结果。
        // 解决方案：在布局计算入口处，强制将所有节点的 measured 设置为我们控制的 style 值。
        const normalizedNodes = nodes.map(n => {
            const clone = { ...n };
            const styleW = (n as any)?.style?.width;
            const styleH = (n as any)?.style?.height;
            // 如果 style 有值，就用它覆盖 measured；否则保持现状
            if (typeof styleW === 'number' && typeof styleH === 'number') {
                (clone as any).measured = { width: styleW, height: styleH };
            } else if (!((clone as any).measured)) {
                // 如果没有 style 也没有 measured，设置默认值
                (clone as any).measured = { width: 200, height: 80 };
            }
            return clone;
        });

        const cfg: any = diagramConfigManager.getConfig() || {};
        const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

        // [DEBUG] 确认代码执行
        console.log('=====================================================');
        console.log('[DomainDagre] calculateLayout 方法开始执行!');
        console.log('=====================================================');

        // 配置参数
        const domainGap = num(cfg?.domain?.gap, 80);
        const nodeGapH = Math.max(40, num(cfg?.node?.gap?.horizontal, 100));
        const nodeGapV = Math.max(30, num(cfg?.node?.gap?.vertical, 60));
        const direction = String((options as any)?.direction || cfg?.diagram?.layout?.direction || 'TB').toUpperCase();
        const isHorizontal = direction === 'LR' || direction === 'RL';

        const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
        const titleSafe = num(layoutCfg?.GROUP_TITLE_SAFE_GAP, 8);
        const bottomSafe = num(layoutCfg?.GROUP_BOTTOM_SAFE_GAP, 12);
        const sideSafeGap = num((cfg?.domain?.sideSafeGap), 0);
        const bottomSafeGap = num((cfg?.domain?.bottomSafeGap), 0);
        const widthCompensation = num((cfg?.domain?.widthCompensation), 1.0);

        // 调试：打印实际使用的间距值
        console.log(`[DomainDagre] Gap values: domainGap=${domainGap}, nodeGapH=${nodeGapH}, nodeGapV=${nodeGapV}, direction=${direction}, isHorizontal=${isHorizontal}`);
        console.log(`[DomainDagre] Config source:`, { domain: cfg?.domain?.gap, nodeH: cfg?.node?.gap?.horizontal, nodeV: cfg?.node?.gap?.vertical });

        // 内边距配置
        const dPadH = num(cfg?.domain?.padding?.horizontal, 24);
        const dPadV = num(cfg?.domain?.padding?.vertical, 24);
        const sdPadH = num(cfg?.subDomain?.padding?.horizontal, 24);
        const sdPadV = num(cfg?.subDomain?.padding?.vertical, 24);
        const sdTitleH = num(cfg?.subDomain?.title?.height ?? 48, 48);
        const dTitleH = num(cfg?.domain?.title?.height ?? 48, 48); // 域标题高度默认同子域

        // 安全边距：用于补偿节点实际渲染宽度与预计算宽度的差异
        // 将安全边距直接应用，确保对称
        const BOUNDS_SAFETY_MARGIN = sideSafeGap;
        const HALF_SAFETY_MARGIN = BOUNDS_SAFETY_MARGIN;
        // 实际水平内边距 = 配置内边距 + 半安全边距
        const sdPadHEffective = sdPadH + HALF_SAFETY_MARGIN;
        const dPadHEffective = dPadH + HALF_SAFETY_MARGIN;

        // 默认节点尺寸配置
        const defaultNodeW = num(cfg?.node?.width, 200);
        const defaultNodeH = num(cfg?.node?.height, 80);

        // [FIX] 优先使用 style 而非 measured，避免 React Flow 异步 measured 导致的不稳定
        const getNodeDimensions = (node: ReactFlowNode): { width: number; height: number } => {
            const styleW = (node as any).style?.width;
            const styleH = (node as any).style?.height;
            const measuredW = (node as any).measured?.width;
            const measuredH = (node as any).measured?.height;
            const nodeW = (node as any).width;
            const nodeH = (node as any).height;
            // style 优先，因为它是我们 ensureMeasuredForNodes 写入的确定性值
            const w = (typeof styleW === 'number' ? styleW : null)
                || measuredW
                || nodeW
                || defaultNodeW;
            const h = (typeof styleH === 'number' ? styleH : null)
                || measuredH
                || nodeH
                || defaultNodeH;
            return { width: w, height: h };
        };

        // 白名单配置
        const domainWhitelist = (options as any)?.domainWhitelist as string[] | undefined;
        const subWhitelist = (options as any)?.subDomainWhitelist as string[] | undefined;
        const showDomain = ((options as any)?.generateDomainGroups !== undefined)
            ? !!(options as any)?.generateDomainGroups : true;
        const showSub = ((options as any)?.generateSubDomainGroups !== undefined)
            ? !!((options as any)?.generateSubDomainGroups) : true;

        // 应用域/子域分组和白名单过滤 (使用归一化后的节点以确保尺寸一致)
        let processedNodes: ReactFlowNode[] = normalizedNodes as ReactFlowNode[];
        processedNodes = applyDomainGrouping(processedNodes as any, domainWhitelist) as any;
        processedNodes = normalizeMissingNodeSubDomainByDomain(processedNodes) as any;
        processedNodes = applySubGrouping(processedNodes as unknown as ReactFlowNode<StandardNodeData>[], subWhitelist) as any;
        processedNodes = assignChildrenToSubGroupsBySemantic(processedNodes as any) as ReactFlowNode[];
        processedNodes = ensureMeasuredForNodes(processedNodes);
        processedNodes = normalizeSubGroupDomainByChildren(processedNodes);

        // 应用显隐性控制
        processedNodes = processedNodes.map(n => {
            const clone: any = { ...n, data: { ...(n as any).data } };
            if (String(n.type || '') === 'subGroup') {
                const key = String((clone.data?.subDomain || '')).trim();
                const inWhite = Array.isArray(subWhitelist) ? subWhitelist.includes(key) : false;
                const visible = showSub ? (Array.isArray(subWhitelist) ? inWhite : true) : false;
                clone.data.hidden = !visible;
            }
            if (String(n.type || '') === 'titleGroup') {
                const dKey = String(((clone.data?.domain || '') || '')).trim();
                const inWhiteDom = Array.isArray(domainWhitelist) ? domainWhitelist.includes(dKey) : false;
                const visibleDom = showDomain ? (Array.isArray(domainWhitelist) ? inWhiteDom : true) : false;
                clone.data.hidden = !visibleDom;
            }
            return clone as ReactFlowNode;
        });

        // [FIX] 强制使用 style 值创建 measured，而非保留原有的 measured
        let updatedNodes = processedNodes.map(n => {
            const styleW = (n as any).style?.width;
            const styleH = (n as any).style?.height;
            return {
                ...n,
                position: { ...n.position },
                // 始终用 style 覆盖 measured，确保一致性
                measured: {
                    width: typeof styleW === 'number' ? styleW : ((n as any).width || 200),
                    height: typeof styleH === 'number' ? styleH : ((n as any).height || 80),
                }
            };
        }) as ReactFlowNode[];

        // 构建辅助函数
        const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n]));
        const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
        const domainOf = (n: ReactFlowNode): string => {
            const dt: any = (n as any)?.data || {};
            return String(dt?.domain || '').trim();
        };
        // [FIX] 忽略 RF measured，只用 style 确保一致性

        // 调试：显示所有节点的类型
        console.log(`[DomainDagre] Input nodes: ${updatedNodes.length}`);
        const typeCount: Record<string, number> = {};
        updatedNodes.forEach(n => {
            const t = String(n.type || 'undefined');
            typeCount[t] = (typeCount[t] || 0) + 1;
        });
        console.log(`[DomainDagre] Node types:`, typeCount);

        // 辅助函数：检查节点是否隐藏
        const isHidden = (n: ReactFlowNode): boolean => !!(((n as any)?.data) || {})?.hidden;

        // 分类节点（过滤掉隐藏的节点）
        const domains = updatedNodes.filter(n => String(n.type || '') === 'titleGroup' && !isHidden(n));
        const subGroups = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && !isHidden(n));
        const leafNodes = updatedNodes.filter(n => !isGroupType(n.type) && !isHidden(n));

        console.log(`[DomainDagre] Classified: ${domains.length} domains, ${subGroups.length} subGroups, ${leafNodes.length} leafNodes`);
        // [DEBUG] 详细调试：输出布局模式选择原因
        console.log(`[DomainDagre] 布局模式判断: domains=${domains.length}, subGroups=${subGroups.length}`);
        if (domains.length === 0 && subGroups.length === 0) {
            console.log(`[DomainDagre] >>> 进入【简化模式】：无域容器`);
        } else if (domains.length === 0 && subGroups.length > 0) {
            console.log(`[DomainDagre] >>> 进入【扩展简化模式】：有子域无域`);
        } else {
            console.log(`[DomainDagre] >>> 进入【完整域级模式】：有 ${domains.length} 个域`);
        }

        // ============================================
        // 简化模式：没有域容器时，直接布局所有叶节点
        // ============================================
        if (domains.length === 0 && subGroups.length === 0) {
            console.log(`[DomainDagre] No domain containers found, using simple Dagre layout for ${leafNodes.length} leaf nodes`);

            // 直接使用 Dagre 布局所有叶节点
            const result = this.layoutWithDagre(
                leafNodes,
                edges,
                isHorizontal ? 'LR' : 'TB',
                isHorizontal ? nodeGapV : nodeGapH,
                isHorizontal ? nodeGapH : nodeGapV,
                getNodeDimensions,
                'network-simplex'
            );

            // 应用布局结果
            result.forEach(pos => {
                const node = idMap.get(pos.id);
                if (node) {
                    const newX = pos.x + 50;
                    const newY = pos.y + 50;
                    node.position = { x: newX, y: newY };
                    // 同步设置 positionAbsolute（简化模式下没有父节点）
                    (node as any).positionAbsolute = { x: newX, y: newY };

                    // [FIX] 忽略 RF measured，只用 style 确保一致性
                    const w = (node as any).style?.width || 200;
                    const h = (node as any).style?.height || 80;
                    (node as any).measured = { width: w, height: h };
                }
            });

            console.log(`[DomainDagre] Simple layout complete: ${result.length} nodes positioned`);

            // 调试：打印节点尺寸信息
            const sampleNodes = leafNodes.slice(0, 3);
            console.log(`[DomainDagre] Sample node dimensions:`, sampleNodes.map(n => ({
                id: n.id,
                pos: n.position,
                absPos: (n as any).positionAbsolute,
                measured: (n as any).measured,
                style: { w: (n as any).style?.width, h: (n as any).style?.height }
            })));

            // 过滤边：移除引用不存在或隐藏节点的边
            const visibleNodeIds = new Set(leafNodes.map(n => n.id));
            const validEdges = edges.filter(e => {
                const srcExists = visibleNodeIds.has(e.source);
                const tgtExists = visibleNodeIds.has(e.target);
                if (!srcExists || !tgtExists) {
                    console.log(`[DomainDagre] Filtering edge ${e.source} -> ${e.target}: src=${srcExists}, tgt=${tgtExists}`);
                }
                return srcExists && tgtExists;
            });
            console.log(`[DomainDagre] Edges: ${edges.length} total, ${validEdges.length} valid`);

            // 智能边路由
            this.applyEdgeRouting(updatedNodes, validEdges, idMap, cfg, options);

            // 并行边分离
            const separatedEdges = separateParallelEdges(validEdges, 12);

            return { nodes: updatedNodes, edges: separatedEdges };
        }

        // ============================================
        // 扩展简化模式：有子域但没有域容器时，直接布局子域+叶节点
        // ============================================
        if (domains.length === 0 && subGroups.length > 0) {
            console.log(`[DomainDagre] No visible domains but ${subGroups.length} subGroups found, using flat layout for subGroups + leafNodes`);

            // 先布局每个子域内部
            const childrenBySub = new Map<string, string[]>();
            subGroups.forEach(sg => {
                const ch = Array.isArray((sg as any)?.data?.children)
                    ? ((sg as any).data.children as string[])
                    : [];
                childrenBySub.set(sg.id, ch.filter(id => idMap.has(id)));
            });

            const nodeToSubGroup = new Map<string, string>();
            childrenBySub.forEach((children, sgId) => {
                children.forEach(childId => nodeToSubGroup.set(childId, sgId));
            });

            // 布局每个子域内部的节点
            subGroups.forEach(sg => {
                const sgChildren = (childrenBySub.get(sg.id) || [])
                    .map(id => idMap.get(id))
                    .filter(Boolean) as ReactFlowNode[];

                if (sgChildren.length > 0) {
                    const sgEdges = edges.filter(e =>
                        sgChildren.some(n => n.id === e.source) &&
                        sgChildren.some(n => n.id === e.target)
                    );

                    const result = this.layoutWithDagre(
                        sgChildren,
                        sgEdges,
                        isHorizontal ? 'LR' : 'TB',
                        isHorizontal ? nodeGapV : nodeGapH,
                        isHorizontal ? nodeGapH : nodeGapV,
                        getNodeDimensions
                    );

                    result.forEach(pos => {
                        const node = idMap.get(pos.id);
                        if (node) {
                            // 修正内边距与标题区域：sdTitleH + titleSafe + sdPadV
                            node.position = { x: pos.x + sdPadHEffective, y: pos.y + sdTitleH + titleSafe + sdPadV };
                        }
                    });

                    // 计算子域尺寸（使用有效内边距确保左右对称）
                    // 计算子域尺寸（增加底部安全边距与 Dagre 专项缓冲 40px）
                    const bounds = this.calculateBounds(sgChildren, getNodeDimensions, widthCompensation);
                    const sgWidth = bounds.width + sdPadHEffective * 2;
                    const sdBottomSafe = num(cfg?.subDomain?.padding?.bottom, 16);
                    const sgHeight = bounds.height + sdTitleH + titleSafe + sdPadV * 2 + sdBottomSafe + 40;

                    (sg as any).measured = { width: sgWidth, height: sgHeight };
                    (sg as any).style = { ...(sg as any).style, width: sgWidth, height: sgHeight };
                }
            });

            // 获取不属于任何子域的自由节点
            const freeNodes = leafNodes.filter(n => !nodeToSubGroup.has(n.id));

            // 将子域和自由节点一起进行顶层布局
            const topLevelItems: ReactFlowNode[] = [...subGroups, ...freeNodes];

            // 映射边到顶层项
            const topLevelEdges = this.mapEdgesToContainers(
                edges,
                nodeToSubGroup
            );

            // 使用 Dagre 布局顶层项
            const topResult = this.layoutWithDagre(
                topLevelItems,
                topLevelEdges,
                isHorizontal ? 'LR' : 'TB',
                isHorizontal ? nodeGapV : nodeGapH,
                isHorizontal ? nodeGapH : nodeGapV,
                getNodeDimensions
            );

            // 应用顶层布局结果
            topResult.forEach(pos => {
                const item = idMap.get(pos.id);
                if (item) {
                    const isSubGroup = String(item.type || '') === 'subGroup';
                    if (isSubGroup) {
                        // 对于子域，移动其自身及所有子节点
                        const dx = pos.x + 50 - item.position.x;
                        const dy = pos.y + 50 - item.position.y;
                        item.position = { x: pos.x + 50, y: pos.y + 50 };
                        (item as any).positionAbsolute = { x: pos.x + 50, y: pos.y + 50 };

                        // 移动子节点
                        const children = childrenBySub.get(item.id) || [];
                        children.forEach(childId => {
                            const child = idMap.get(childId);
                            if (child) {
                                child.position = { x: child.position.x + dx, y: child.position.y + dy };
                                (child as any).positionAbsolute = { x: child.position.x, y: child.position.y };
                            }
                        });
                    } else {
                        // 自由节点直接设置位置
                        item.position = { x: pos.x + 50, y: pos.y + 50 };
                        (item as any).positionAbsolute = { x: pos.x + 50, y: pos.y + 50 };
                    }
                }
            });

            console.log(`[DomainDagre] Flat layout complete: ${topLevelItems.length} top-level items`);

            // 过滤边并克隆，确保 React 能检测到 handle 修改
            const visibleNodeIds = new Set(leafNodes.map(n => n.id));
            const validEdges = edges
                .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
                .map(e => ({ ...e }));  // 克隆每个 edge 对象

            // 智能边路由
            this.applyEdgeRouting(updatedNodes, validEdges, idMap, cfg, options);

            // 并行边分离
            const separatedEdges = separateParallelEdges(validEdges, 12);

            return { nodes: updatedNodes, edges: separatedEdges };
        }

        // 构建归属关系
        const childrenBySub = new Map<string, string[]>();
        subGroups.forEach(sg => {
            const ch = Array.isArray((sg as any)?.data?.children)
                ? ((sg as any).data.children as string[])
                : [];
            childrenBySub.set(sg.id, ch.filter(id => idMap.has(id)));
        });

        const nodeToSubGroup = new Map<string, string>();
        childrenBySub.forEach((children, sgId) => {
            children.forEach(childId => nodeToSubGroup.set(childId, sgId));
        });

        // ============================================
        // 第一阶段：域内部布局（每个域单独使用 Dagre）
        // ============================================

        // 先将所有域位置初始化为 (0, 0)，内部布局相对于域原点
        domains.forEach(domain => {
            domain.position = { x: 0, y: 0 };
        });

        domains.forEach(domain => {
            const dk = domainOf(domain);

            // 获取该域下的所有子域
            const domainSubGroups = subGroups.filter(sg => domainOf(sg) === dk);

            // 获取该域下的自由节点（不属于任何子域）
            const domainFreeNodes = leafNodes.filter(n =>
                domainOf(n) === dk && !nodeToSubGroup.has(n.id)
            );

            // 先布局每个子域内部
            domainSubGroups.forEach(sg => {
                const sgChildren = (childrenBySub.get(sg.id) || [])
                    .map(id => idMap.get(id))
                    .filter(Boolean) as ReactFlowNode[];

                if (sgChildren.length > 0) {
                    // 获取子域内的边
                    const sgEdges = edges.filter(e =>
                        sgChildren.some(n => n.id === e.source) &&
                        sgChildren.some(n => n.id === e.target)
                    );

                    // 使用 Dagre 布局子域
                    const result = this.layoutWithDagre(
                        sgChildren,
                        sgEdges,
                        isHorizontal ? 'LR' : 'TB',
                        isHorizontal ? nodeGapV : nodeGapH,
                        isHorizontal ? nodeGapH : nodeGapV,
                        getNodeDimensions
                    );

                    // 应用布局结果
                    result.forEach(pos => {
                        const node = idMap.get(pos.id);
                        if (node) {
                            // 使用有效内边距确保左右对称
                            node.position = { x: pos.x + sdPadHEffective, y: pos.y + sdTitleH + sdPadV };
                        }
                    });

                    // 计算子域尺寸（使用有效内边距确保左右对称）
                    const bounds = this.calculateBounds(sgChildren, getNodeDimensions, widthCompensation);
                    const sgWidth = bounds.width + sdPadHEffective * 2;
                    const sgHeight = bounds.height + sdTitleH + sdPadV * 2;

                    // 调试：打印子域边界计算详情
                    console.log(`[DomainDagre] SubGroup ${sg.id} bounds calculation:`);
                    console.log(`  - bounds: minX=${bounds.minX}, maxX=${bounds.minX + bounds.width}, width=${bounds.width}`);
                    console.log(`  - padding: sdPadHEffective=${sdPadHEffective}, sdPadV=${sdPadV}, sdTitleH=${sdTitleH}`);
                    console.log(`  - result: sgWidth=${sgWidth}, sgHeight=${sgHeight}`);
                    console.log(`  - children:`, sgChildren.map(c => ({
                        id: c.id,
                        pos: c.position,
                        dims: getNodeDimensions(c)
                    })));

                    (sg as any).measured = { width: sgWidth, height: sgHeight };
                    (sg as any).style = { ...(sg as any).style, width: sgWidth, height: sgHeight };
                }
            });

            // 布局子域 + 自由节点在域内的位置
            const domainChildren: ReactFlowNode[] = [
                ...domainSubGroups,
                ...domainFreeNodes
            ];

            if (domainChildren.length > 0) {
                // 获取域内跨子域边
                const domainEdges = edges.filter(e => {
                    const src = idMap.get(e.source);
                    const tgt = idMap.get(e.target);
                    if (!src || !tgt) return false;
                    return domainOf(src) === dk && domainOf(tgt) === dk &&
                        (domainChildren.some(c => c.id === e.source) ||
                            domainChildren.some(c => c.id === e.target));
                });

                // 使用 Dagre 布局域内元素
                const result = this.layoutWithDagre(
                    domainChildren,
                    this.mapEdgesToContainers(domainEdges, nodeToSubGroup),
                    isHorizontal ? 'LR' : 'TB',
                    isHorizontal ? nodeGapV : nodeGapH,
                    isHorizontal ? nodeGapH : nodeGapV,
                    getNodeDimensions
                );

                // 应用布局结果
                result.forEach(pos => {
                    const node = idMap.get(pos.id);
                    if (node) {
                        const oldX = node.position.x;
                        const oldY = node.position.y;
                        // 修正内边距与标题区域：dTitleH + titleSafe + dPadV
                        const newX = pos.x + dPadHEffective;
                        const newY = pos.y + dTitleH + titleSafe + dPadV;

                        // 如果是子域，需要同步移动子节点
                        if (String(node.type) === 'subGroup') {
                            const deltaX = newX - oldX;
                            const deltaY = newY - oldY;

                            (childrenBySub.get(node.id) || []).forEach(childId => {
                                const child = idMap.get(childId);
                                if (child) {
                                    child.position = {
                                        x: child.position.x + deltaX,
                                        y: child.position.y + deltaY
                                    };
                                }
                            });
                        }

                        node.position = { x: newX, y: newY };
                    }
                });

                // 计算域尺寸（使用有效内边距确保左右对称）
                // 注意：只使用 domainChildren（子域 + 自由节点）来计算边界
                // 因为子域的 measured 已经包含了内部节点的尺寸
                // 而叶节点的 position 是相对于父子域的，不能直接加入域边界计算
                // 计算域尺寸（包含标题高度、安全边距、底部缓冲区以及全局 bottomSafeGap 补偿）
                const bounds = this.calculateBounds(domainChildren, getNodeDimensions, widthCompensation);
                const domainWidth = bounds.width + dPadHEffective * 2;
                const domainHeight = bounds.height + dTitleH + titleSafe + dPadV * 2 + bottomSafe + bottomSafeGap;

                (domain as any).measured = { width: domainWidth, height: domainHeight };
                (domain as any).style = { ...(domain as any).style, width: domainWidth, height: domainHeight };
            }
        });

        // ============================================
        // 子域整体居中处理
        // ============================================
        // 在域内布局完成、域尺寸确定后,使域内多个子域作为整体相对父域居中
        console.log('[DomainDagre] Applying subdomain centering...');
        updatedNodes = centerSubGroupsInDomain(updatedNodes);

        // 更新节点映射以保持引用同步
        idMap.clear();
        updatedNodes.forEach(n => idMap.set(n.id, n));

        console.log('[DomainDagre] Subdomain centering complete.');

        // ============================================
        // 第二阶段：域级布局（使用 Dagre 基于跨域边排列）
        // ============================================

        // 提取跨域边
        const crossDomainEdges: Edge[] = [];
        const domainIdMap = new Map<string, string>();
        domains.forEach(d => domainIdMap.set(domainOf(d), d.id));

        edges.forEach(e => {
            const src = idMap.get(e.source);
            const tgt = idMap.get(e.target);
            if (!src || !tgt) return;

            const srcDomain = domainOf(src);
            const tgtDomain = domainOf(tgt);

            if (srcDomain && tgtDomain && srcDomain !== tgtDomain) {
                const srcDomainId = domainIdMap.get(srcDomain);
                const tgtDomainId = domainIdMap.get(tgtDomain);

                if (srcDomainId && tgtDomainId) {
                    // 避免重复边
                    if (!crossDomainEdges.some(
                        ce => ce.source === srcDomainId && ce.target === tgtDomainId
                    )) {
                        crossDomainEdges.push({
                            id: `domain_edge_${srcDomainId}_${tgtDomainId}`,
                            source: srcDomainId,
                            target: tgtDomainId,
                        });
                    }
                }
            }
        });

        // 孤立节点
        const orphanNodes = leafNodes.filter(n => !domainOf(n) && !nodeToSubGroup.has(n.id));

        // 域级 Dagre 布局
        const domainLayoutNodes: ReactFlowNode[] = [...domains, ...orphanNodes];

        // 调试：打印域的尺寸
        console.log(`[DomainDagre] Domain sizes before layout:`);
        domainLayoutNodes.forEach(d => {
            // [FIX] 忽略 RF measured，只用 style
            const w = (d as any).style?.width || 200;
            const h = (d as any).style?.height || 80;
            console.log(`  - ${d.id}: ${w}x${h}`);
        });
        console.log(`[DomainDagre] Cross-domain edges: ${crossDomainEdges.length}`, crossDomainEdges.map(e => `${e.source} -> ${e.target}`));

        if (domainLayoutNodes.length > 0) {
            const result = this.layoutWithDagre(
                domainLayoutNodes,
                crossDomainEdges,
                isHorizontal ? 'LR' : 'TB',
                domainGap,
                domainGap,
                getNodeDimensions,
                'network-simplex'  // 最优的层级分配算法
            );

            // 应用域级布局
            console.log(`[DomainDagre] Domain layout results:`, result.map(r => `${r.id}: (${r.x.toFixed(0)}, ${r.y.toFixed(0)})`));

            result.forEach(pos => {
                const node = idMap.get(pos.id);
                if (!node) return;

                // 域的旧位置应该是 (0, 0)，因为我们在阶段1前初始化了
                const oldX = node.position.x;  // 应该是 0
                const oldY = node.position.y;  // 应该是 0

                // 新位置是 Dagre 计算的位置
                const newX = pos.x;
                const newY = pos.y;

                // 如果是域，需要同步移动所有子节点
                if (String(node.type) === 'titleGroup') {
                    const dk = domainOf(node);

                    // 计算需要移动的距离
                    const deltaX = newX - oldX;
                    const deltaY = newY - oldY;

                    console.log(`[DomainDagre] Moving domain "${dk}": (${oldX}, ${oldY}) -> (${newX.toFixed(0)}, ${newY.toFixed(0)}), delta=(${deltaX.toFixed(0)}, ${deltaY.toFixed(0)})`);

                    // 移动该域下的所有子节点
                    updatedNodes.forEach(child => {
                        if (child.id === node.id) return;
                        if (domainOf(child) !== dk) return;

                        child.position = {
                            x: child.position.x + deltaX,
                            y: child.position.y + deltaY
                        };
                    });
                }

                // 更新域/孤立节点位置
                node.position = { x: newX, y: newY };
            });
        }

        // ============================================
        // 子域整体居中处理（在所有域级布局完成后）
        // ============================================

        updatedNodes = centerSubGroupsInDomain(updatedNodes);

        // 更新节点映射以保持引用同步
        idMap.clear();
        updatedNodes.forEach(n => idMap.set(n.id, n));

        // [FIX] 居中后域尺寸回收：确保域容器严格包含所有成员
        // 居中可能导致子域的右缘超出域容器，此步骤检测并扩展域尺寸
        {
            const fixDomains = updatedNodes.filter(n => String(n.type || '') === 'titleGroup' && !isHidden(n));
            for (const domain of fixDomains) {
                const dk = domainOf(domain);
                const dx = domain.position.x;
                const dy = domain.position.y;

                let maxRight = -Infinity;
                let maxBottom = -Infinity;

                for (const n of updatedNodes) {
                    if (n.id === domain.id) continue;
                    if (domainOf(n) !== dk) continue;
                    if (isHidden(n)) continue;
                    if (String(n.type || '') === 'titleGroup') continue;

                    const dims = getNodeDimensions(n);
                    maxRight = Math.max(maxRight, n.position.x + dims.width);
                    maxBottom = Math.max(maxBottom, n.position.y + dims.height);
                }

                if (!isFinite(maxRight)) continue;

                const curW = num((domain as any).style?.width, 0);
                const curH = num((domain as any).style?.height, 0);
                const needW = maxRight - dx + dPadHEffective;
                const needH = maxBottom - dy + dPadV + bottomSafe + bottomSafeGap;

                if (needW > curW || needH > curH) {
                    const finalW = Math.max(curW, needW);
                    const finalH = Math.max(curH, needH);
                    (domain as any).measured = { width: finalW, height: finalH };
                    (domain as any).style = { ...(domain as any).style, width: finalW, height: finalH };
                }
            }
        }

        // ============================================
        // 第三阶段：智能边路由
        // ============================================

        const getAbsPos = (n: ReactFlowNode): { x: number, y: number } => {
            let x = n.position.x;
            let y = n.position.y;
            let current = n;
            let depth = 0;
            while (current.parentId && depth < 10) {
                const parent = idMap.get(current.parentId);
                if (!parent) break;
                x += parent.position.x;
                y += parent.position.y;
                current = parent;
                depth++;
            }
            return { x, y };
        };

        // 确保所有节点有 positionAbsolute、width、height 和 measured
        updatedNodes.forEach(n => {
            const absPos = getAbsPos(n);
            (n as any).positionAbsolute = absPos;

            // [FIX] 忽略 React Flow 的 measured（它可能在不同渲染周期有不同值），只使用 ensureMeasuredForNodes 写入的 style
            const w = (n as any).style?.width || (n as any).width || 200;
            const h = (n as any).style?.height || (n as any).height || 80;
            (n as any).width = w;
            (n as any).height = h;
            (n as any).measured = { width: w, height: h };
        });

        // 调试日志：检查几个节点的尺寸信息
        const sampleLeafs = leafNodes.slice(0, 3);
        console.log(`[DomainDagre] Node dimensions before edge routing:`, sampleLeafs.map(n => ({
            id: n.id,
            pos: n.position,
            absPos: (n as any).positionAbsolute,
            width: (n as any).width,
            height: (n as any).height,
            measured: (n as any).measured
        })));

        const cfgEdge = cfg?.edge || {};
        const routingConfig = {
            mode: 'advanced-smart' as const,
            globalPath: (cfgEdge.pathType || 'step') as string,
            autoPathSelection: true,
            angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
            bezierDistanceThreshold: Number(cfgEdge.bezierDistanceThreshold ?? 280),
            // [FIX] 增大搜索范围，让 A* 算法能寻找到绕行空旷区域的路径
            obstacleScopePadding: Number(cfgEdge.obstacleScopePadding ?? 300),
            corridorObstacleThreshold: Number(cfgEdge.corridorObstacleThreshold ?? 6),
            directionalHandlePolicy: String(cfgEdge.directionalHandlePolicy || 'prefer') as any,
            verticalBiasThreshold: Number(cfgEdge.verticalBiasThreshold ?? 1.2),
            // [FIX] 增大障碍物膨胀，让节点周围有更大禁区，迫使连线绕行空旷区域
            obstaclePadding: Number(cfgEdge.obstaclePadding ?? 80),
            ignoreContainers: Boolean(cfgEdge.ignoreContainers ?? false),
            layoutDirection: options.direction || 'TB',
            // [FIX] 增大 A* 扩展次数，允许搜索更远的绕行路径
            gridAStarMaxExpansions: Number(cfgEdge.gridAStarMaxExpansions ?? 600),
            // [FIX] 减小网格尺寸，提高绕行精度
            gridAStarGridSize: Number(cfgEdge.gridAStarGridSize ?? 30)
        };

        // Enforce strict direction for Dagre to ensure stability
        if (routingConfig.mode === 'advanced-smart') {
            routingConfig.directionalHandlePolicy = 'force';
        }

        // [FIX] 确保传入 decideEdgeRouting 的节点数组顺序是确定性的
        // 这对于 A* 障碍物避让计算非常重要，不同的顺序可能导致不同的路径选择
        const sortedNodesForRouting = [...updatedNodes].sort((a, b) => a.id.localeCompare(b.id));

        // 克隆 edges 以确保 React 能检测到修改
        // Sort edges by source then target to ensure consistent processing order for "bus" optimization
        const clonedEdges = edges
            .map(e => ({ ...e }))
            .sort((a, b) => {
                const sComp = a.source.localeCompare(b.source);
                if (sComp !== 0) return sComp;
                return a.target.localeCompare(b.target);
            });

        const nodeUsage: Record<string, Record<string, number>> = {};
        // P1: Edge-Edge Avoidance - 收集已路由边的路径
        const routedPaths: Array<{ points: Array<{ x: number; y: number }> }> = [];

        // [FIX] 强制同步点：让出到微任务队列，确保所有待处理的状态更新完成
        // 这模拟了 DevTools 打开时 console.log 造成的微小延迟，解决 F12 打开/关闭的差异问题
        await Promise.resolve();

        clonedEdges.forEach(edge => {
            const source = idMap.get(edge.source);
            const target = idMap.get(edge.target);
            if (!source || !target) {
                // [FIX] 即使 source/target 不在 idMap 中，也要确保边有 handle ID
                // 否则 React Flow 无法定位连接点，边不会渲染
                const dir = (options.direction || 'TB').toUpperCase();
                if (!edge.sourceHandle) {
                    edge.sourceHandle = (dir === 'LR' || dir === 'RL') ? 'right' : 'bottom';
                }
                if (!edge.targetHandle) {
                    edge.targetHandle = (dir === 'LR' || dir === 'RL') ? 'left' : 'top';
                }
                console.warn(`[DomainDagre] ⚠️ 边 ${edge.id || edge.source + '->' + edge.target} 的 source/target 不在 idMap 中 (source=${!!source}, target=${!!target})，使用默认 handle`);
                return;
            }

            const sUsage = nodeUsage[source.id] || {};
            const tUsage = nodeUsage[target.id] || {};

            const routingResult = decideEdgeRouting(
                source,
                target,
                sortedNodesForRouting,  // [FIX] 使用排序后的节点数组确保确定性
                { ...routingConfig, routedPaths },  // P1: 传入已路由路径
                { source: sUsage, target: tUsage },
                true
            );

            edge.type = routingResult.type;
            edge.sourceHandle = routingResult.sourceHandle;
            edge.targetHandle = routingResult.targetHandle;
            if (!edge.data) edge.data = {} as any;
            (edge.data as any).autoSource = Boolean(routingResult.autoSource);
            (edge.data as any).autoTarget = Boolean(routingResult.autoTarget);
            const autoList: string[] = [];
            if (routingResult.autoSource) autoList.push('source');
            if (routingResult.autoTarget) autoList.push('target');
            (edge.data as any).auto = autoList;

            // [FIX] 将 A* 计算的障碍物避让路径存储到 edge.data，供边渲染器使用
            if (routingResult.computedPath && routingResult.computedPath.length >= 2) {
                (edge.data as any).computedPath = routingResult.computedPath;
                // 使用 advanced-smart-step 边类型，它会优先读取 computedPath
                edge.type = 'advanced-smart-step';
            }

            // P1: 记录此边的完整计算路径
            if (routingResult.computedPath && routingResult.computedPath.length >= 2) {
                routedPaths.push({ points: routingResult.computedPath });
            } else {
                // Fallback: 使用起点终点
                const sPos = (source as any).positionAbsolute ?? (source as any).position ?? { x: 0, y: 0 };
                const tPos = (target as any).positionAbsolute ?? (target as any).position ?? { x: 0, y: 0 };
                const sW = (source as any)?.measured?.width ?? 100;
                const sH = (source as any)?.measured?.height ?? 50;
                const tW = (target as any)?.measured?.width ?? 100;
                const tH = (target as any)?.measured?.height ?? 50;

                // 根据 handle 计算锚点
                const handleToAnchor = (pos: any, w: number, h: number, handle: string) => {
                    switch (handle) {
                        case 'l': case 'left': return { x: pos.x, y: pos.y + h / 2 };
                        case 'r': case 'right': return { x: pos.x + w, y: pos.y + h / 2 };
                        case 't': case 'top': return { x: pos.x + w / 2, y: pos.y };
                        case 'b': case 'bottom': return { x: pos.x + w / 2, y: pos.y + h };
                        default: return { x: pos.x + w / 2, y: pos.y + h / 2 };
                    }
                };

                const startPt = handleToAnchor(sPos, sW, sH, routingResult.sourceHandle);
                const endPt = handleToAnchor(tPos, tW, tH, routingResult.targetHandle);
                routedPaths.push({ points: [startPt, endPt] });
            }

            if (!nodeUsage[source.id]) nodeUsage[source.id] = {};
            nodeUsage[source.id][routingResult.sourceHandle] =
                (nodeUsage[source.id][routingResult.sourceHandle] || 0) + 1;

            if (!nodeUsage[target.id]) nodeUsage[target.id] = {};
            nodeUsage[target.id][routingResult.targetHandle] =
                (nodeUsage[target.id][routingResult.targetHandle] || 0) + 1;
        });

        console.log(`[DomainDagre] Layout complete: ${domains.length} domains, ${crossDomainEdges.length} cross-domain edges`);

        // ═══════════════════════════════════════════════════════════════
        // [FIX] 禁用 P4-P8 后处理管道（对齐 DiagramView-SVG 设计）
        // 根因：P7 beautifyOrthogonalEdges / P8 optimizeTreeBusRouting
        // 使用短格式 handle ID ('r'/'l'/'t'/'b')，与 FlowchartNode 的
        // 全称 Handle ID ('right'/'left'/'top'/'bottom') 不兼容，
        // 导致 React Flow 无法匹配 Handle → 边不渲染。
        // decideEdgeRouting 返回的 handle 已经是正确的全称格式，
        // 直接使用即可。
        // ═══════════════════════════════════════════════════════════════
        let finalRoutedEdges = clonedEdges;

        // ============================================
        // 🎯 子域整体居中处理
        // ============================================
        console.log('[DomainDagre] Applying subdomain centering...');
        updatedNodes = centerSubGroupsInDomain(updatedNodes);
        console.log('[DomainDagre] Subdomain centering complete.');

        return { nodes: updatedNodes, edges: finalRoutedEdges };
    }

    /**
     * 使用 Dagre 进行布局
     */
    private layoutWithDagre(
        nodes: ReactFlowNode[],
        edges: Edge[],
        direction: string,
        nodeSep: number,
        rankSep: number,
        getNodeDimensions?: (node: ReactFlowNode) => { width: number; height: number },
        ranker: string = 'network-simplex'
    ): { id: string; x: number; y: number }[] {
        if (nodes.length === 0) return [];

        const g = new dagre.graphlib.Graph();

        // 分析边的连接模式，确定最佳对齐策略
        const outDegree: Record<string, number> = {};
        const inDegree: Record<string, number> = {};
        edges.forEach(e => {
            outDegree[e.source] = (outDegree[e.source] || 0) + 1;
            inDegree[e.target] = (inDegree[e.target] || 0) + 1;
        });

        // 检测是否有一对多或多对一的模式
        const hasOneToMany = Object.values(outDegree).some(d => d > 1);
        const hasManyToOne = Object.values(inDegree).some(d => d > 1);

        // 根据连接模式选择对齐策略
        // - 一对多模式：使用 'DL' (down-left) 让目标节点向下展开
        // - 多对一模式：使用 'UL' (up-left) 让源节点向上聚合
        // - 混合模式或无特殊模式：使用 undefined (居中对齐)
        let alignStrategy: string | undefined;
        if (hasOneToMany && !hasManyToOne) {
            alignStrategy = 'DL';
        } else if (hasManyToOne && !hasOneToMany) {
            alignStrategy = 'UL';
        } else {
            // 混合模式或简单链式：居中对齐通常效果最好
            alignStrategy = undefined;
        }

        g.setGraph({
            rankdir: direction === 'LR' ? 'LR' : direction === 'RL' ? 'RL' : direction === 'BT' ? 'BT' : 'TB',
            nodesep: nodeSep,
            ranksep: rankSep,
            ranker: ranker,
            align: alignStrategy,
            marginx: 0,
            marginy: 0,
        });

        g.setDefaultEdgeLabel(() => ({}));

        // 添加节点（按输入顺序，Dagre 会尊重这个顺序进行层级分配）
        console.log(`[DomainDagre] layoutWithDagre: Processing ${nodes.length} nodes, align=${alignStrategy}`);
        nodes.forEach(node => {
            // 使用传入的尺寸获取器，或者默认逻辑
            const dims = getNodeDimensions ? getNodeDimensions(node) : this.getNodeDimensions(node);
            const w = dims.width;
            const h = dims.height;

            console.log(`[DomainDagre] Node ${node.id}: resolved size = ${w}x${h}`);
            g.setNode(node.id, { width: w, height: h });
        });

        // 添加边（带权重和最小层级跨度）
        edges.forEach(edge => {
            if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
                // 计算边的权重：一对多的边权重较低，让目标节点更分散
                const sourceOutDegree = outDegree[edge.source] || 1;
                const targetInDegree = inDegree[edge.target] || 1;

                // 权重计算：连接度越高，权重越低（允许更灵活的布局）
                const weight = 1 / Math.max(sourceOutDegree, targetInDegree);

                g.setEdge(edge.source, edge.target, {
                    weight: weight,
                    minlen: 1,  // 最小层级跨度
                });
            }
        });

        // 执行布局
        dagre.layout(g);

        // 收集结果
        const result: { id: string; x: number; y: number }[] = [];
        nodes.forEach(node => {
            const nodeWithPos = g.node(node.id);
            if (nodeWithPos) {
                const dims = getNodeDimensions ? getNodeDimensions(node) : this.getNodeDimensions(node);
                const w = dims.width;
                const h = dims.height;

                // Dagre 返回的是中心点，需要转换为左上角
                result.push({
                    id: node.id,
                    x: nodeWithPos.x - w / 2,
                    y: nodeWithPos.y - h / 2,
                });
            }
        });

        return result;
    }

    /**
     * 将叶节点边映射到容器边
     */
    private mapEdgesToContainers(edges: Edge[], nodeToContainer: Map<string, string>): Edge[] {
        const containerEdges: Edge[] = [];
        const seen = new Set<string>();

        edges.forEach(e => {
            const srcContainer = nodeToContainer.get(e.source) || e.source;
            const tgtContainer = nodeToContainer.get(e.target) || e.target;

            if (srcContainer !== tgtContainer) {
                const key = `${srcContainer}->${tgtContainer}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    containerEdges.push({
                        ...e,
                        id: `cnt-${e.id}`,
                        source: srcContainer,
                        target: tgtContainer
                    });
                }
            }
        });

        return containerEdges;
    }

    /**
     * 计算节点的边界框
     */
    private getNodeDimensions(node: ReactFlowNode): { width: number; height: number } {
        const w = (node as any).measured?.width
            || (typeof (node as any).style?.width === 'number' ? (node as any).style.width : null)
            || (node as any).width
            || 200;
        const h = (node as any).measured?.height
            || (typeof (node as any).style?.height === 'number' ? (node as any).style.height : null)
            || (node as any).height
            || 80;
        return { width: w, height: h };
    }

    /**
     * 计算节点的边界框
     * @param widthCompensation 可选的宽度补偿系数，用于补偿中文文本实际渲染宽度与计算宽度的差异
     */
    private calculateBounds(
        nodes: ReactFlowNode[],
        getNodeDimensions?: (node: ReactFlowNode) => { width: number; height: number },
        widthCompensation: number = 1.0
    ): { width: number; height: number; minX: number; minY: number } {
        if (nodes.length === 0) {
            return { width: 200, height: 100, minX: 0, minY: 0 };
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        nodes.forEach(node => {
            const x = node.position.x;
            const y = node.position.y;
            const dims = getNodeDimensions ? getNodeDimensions(node) : this.getNodeDimensions(node);
            // 应用宽度补偿系数
            const w = dims.width * widthCompensation;
            const h = dims.height;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        });

        return {
            width: Math.max(100, maxX - minX),
            height: Math.max(60, maxY - minY),
            minX,
            minY
        };
    }

    /**
     * 应用智能边路由
     */
    private applyEdgeRouting(
        nodes: ReactFlowNode[],
        edges: Edge[],
        idMap: Map<string, ReactFlowNode>,
        cfg: any,
        options: LayoutOptions
    ): void {
        const getNodeSize = (n: ReactFlowNode): { width: number; height: number } => {
            const w = (n as any).style?.width ?? (n as any).measured?.width ?? (n as any).width ?? 120;
            const h = (n as any).style?.height ?? (n as any).measured?.height ?? (n as any).height ?? 60;
            return { width: w, height: h };
        };
        const getNodeCenter = (n: ReactFlowNode): { cx: number; cy: number } => {
            const pos = (n as any).positionAbsolute || n.position || { x: 0, y: 0 };
            const size = getNodeSize(n);
            return { cx: pos.x + size.width / 2, cy: pos.y + size.height / 2 };
        };
        const getDominantHandle = (centerNode: ReactFlowNode, relatives: ReactFlowNode[]): string => {
            if (relatives.length === 0) return 'bottom';
            const c = getNodeCenter(centerNode);
            let sumX = 0;
            let sumY = 0;
            let count = 0;
            relatives.forEach(rel => {
                if (!rel) return;
                const r = getNodeCenter(rel);
                sumX += r.cx;
                sumY += r.cy;
                count += 1;
            });
            if (count === 0) return 'bottom';
            const dx = sumX / count - c.cx;
            const dy = sumY / count - c.cy;
            if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
            return dy > 0 ? 'bottom' : 'top';
        };
        const oppositeHandle = (h: string): string => {
            if (h === 'left' || h === 'l') return 'right';
            if (h === 'right' || h === 'r') return 'left';
            if (h === 'top' || h === 't') return 'bottom';
            if (h === 'bottom' || h === 'b') return 'top';
            return 'bottom';
        };

        const getAbsPos = (n: ReactFlowNode): { x: number, y: number } => {
            let x = n.position.x;
            let y = n.position.y;
            let current = n;
            let depth = 0;
            while (current.parentId && depth < 10) {
                const parent = idMap.get(current.parentId);
                if (!parent) break;
                x += parent.position.x;
                y += parent.position.y;
                current = parent;
                depth++;
            }
            return { x, y };
        };

        nodes.forEach(n => {
            (n as any).positionAbsolute = getAbsPos(n);
        });

        const cfgEdge = cfg?.edge || {};
        const routingConfig = {
            mode: 'advanced-smart' as const,
            globalPath: (cfgEdge.pathType || 'step') as string,
            autoPathSelection: true,
            angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
            bezierDistanceThreshold: Number(cfgEdge.bezierDistanceThreshold ?? 280),
            obstacleScopePadding: Number(cfgEdge.obstacleScopePadding ?? 160),
            corridorObstacleThreshold: Number(cfgEdge.corridorObstacleThreshold ?? 6),
            directionalHandlePolicy: String(cfgEdge.directionalHandlePolicy || 'prefer') as any,
            verticalBiasThreshold: Number(cfgEdge.verticalBiasThreshold ?? 1.2),
            obstaclePadding: Number(cfgEdge.obstaclePadding ?? 24),
            ignoreContainers: Boolean(cfgEdge.ignoreContainers ?? false),
            layoutDirection: options.direction || 'TB'
        };

        // ============================================
        // 预分析：检测一对多和多对一模式
        // ============================================
        const outgoingEdges: Record<string, Edge[]> = {};  // 每个源节点的出边
        const incomingEdges: Record<string, Edge[]> = {};  // 每个目标节点的入边

        edges.forEach(edge => {
            if (!outgoingEdges[edge.source]) outgoingEdges[edge.source] = [];
            outgoingEdges[edge.source].push(edge);
            if (!incomingEdges[edge.target]) incomingEdges[edge.target] = [];
            incomingEdges[edge.target].push(edge);
        });

        // 预计算：对于多对一的目标节点，决定统一的目标端口
        const manyToOneTargetHandle: Record<string, string> = {};

        for (const [targetId, edgeList] of Object.entries(incomingEdges)) {
            if (edgeList.length > 1) {
                const targetNode = idMap.get(targetId);
                if (!targetNode) continue;
                const sources = edgeList.map(e => idMap.get(e.source)).filter(Boolean) as ReactFlowNode[];
                const unifiedHandle = getDominantHandle(targetNode, sources);
                manyToOneTargetHandle[targetId] = unifiedHandle;
                console.log(`[DomainDagre] Many-to-one detected: ${edgeList.length} edges -> ${targetId}, unified handle: ${unifiedHandle}`);
            }
        }

        // 预计算：对于一对多的源节点，决定统一的源端口
        const oneToManySourceHandle: Record<string, string> = {};

        for (const [sourceId, edgeList] of Object.entries(outgoingEdges)) {
            if (edgeList.length > 1) {
                const sourceNode = idMap.get(sourceId);
                if (!sourceNode) continue;
                const targets = edgeList.map(e => idMap.get(e.target)).filter(Boolean) as ReactFlowNode[];
                const unifiedHandle = getDominantHandle(sourceNode, targets);
                oneToManySourceHandle[sourceId] = unifiedHandle;
                console.log(`[DomainDagre] One-to-many detected: ${sourceId} -> ${edgeList.length} edges, unified handle: ${unifiedHandle}`);
            }
        }

        // ============================================
        // 边路由：应用统一端口或智能选择
        // ============================================
        const nodeUsage: Record<string, Record<string, number>> = {};
        edges.forEach(edge => {
            const source = idMap.get(edge.source);
            const target = idMap.get(edge.target);
            if (!source || !target) return;

            const sUsage = nodeUsage[source.id] || {};
            const tUsage = nodeUsage[target.id] || {};

            // 检查是否需要使用预定的统一端口
            const unifiedSourceHandle = oneToManySourceHandle[source.id];
            const unifiedTargetHandle = manyToOneTargetHandle[target.id];


            let routingResult;
            if (unifiedSourceHandle || unifiedTargetHandle) {
                let sourceHandle: string;
                let targetHandle: string;

                if (unifiedTargetHandle) {
                    targetHandle = unifiedTargetHandle;
                    sourceHandle = oppositeHandle(targetHandle);
                } else {
                    sourceHandle = unifiedSourceHandle || 'bottom';
                    targetHandle = oppositeHandle(sourceHandle);
                }

                routingResult = {
                    type: 'advanced-smart-step' as const,
                    sourceHandle,
                    targetHandle,
                };
            } else {
                // 无统一端口约束，使用完整的智能路由
                routingResult = decideEdgeRouting(
                    source,
                    target,
                    nodes,
                    routingConfig,
                    { source: sUsage, target: tUsage },
                    true
                );
            }

            // 调试：打印边路由决策
            if (manyToOneTargetHandle[target.id] || oneToManySourceHandle[source.id]) {
                console.log(`[DomainDagre] Edge ${edge.id}: ${source.id} -> ${target.id}`);
                console.log(`  - unifiedSourceHandle: ${oneToManySourceHandle[source.id] || 'none'}`);
                console.log(`  - unifiedTargetHandle: ${manyToOneTargetHandle[target.id] || 'none'}`);
                console.log(`  - result: sourceHandle=${routingResult.sourceHandle}, targetHandle=${routingResult.targetHandle}`);
                console.log(`[DomainDagre] FIXING edge ${edge.id} type to '${routingResult.type}'`);
            }

            if (edge.type !== routingResult.type) {
                console.log(`[DomainDagre] MUTATING edge ${edge.id} type from '${edge.type}' to '${routingResult.type}'`);
            }
            edge.type = routingResult.type;
            edge.sourceHandle = routingResult.sourceHandle;
            edge.targetHandle = routingResult.targetHandle;
            if (!edge.data) edge.data = {} as any;
            (edge.data as any).autoSource = Boolean(routingResult.autoSource);
            (edge.data as any).autoTarget = Boolean(routingResult.autoTarget);
            const autoList: string[] = [];
            if (routingResult.autoSource) autoList.push('source');
            if (routingResult.autoTarget) autoList.push('target');
            (edge.data as any).auto = autoList;

            if (!nodeUsage[source.id]) nodeUsage[source.id] = {};
            nodeUsage[source.id][routingResult.sourceHandle] =
                (nodeUsage[source.id][routingResult.sourceHandle] || 0) + 1;

            if (!nodeUsage[target.id]) nodeUsage[target.id] = {};
            nodeUsage[target.id][routingResult.targetHandle] =
                (nodeUsage[target.id][routingResult.targetHandle] || 0) + 1;
        });
    }
}

export default DomainDagreLayoutStrategy;

