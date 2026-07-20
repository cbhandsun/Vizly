import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
import type { StandardNodeData } from '../models/DiagramModels';
import { ILayoutStrategy } from './LayoutStrategyManager';
import { diagramConfigManager } from '../config/DiagramConfig';
import {
    applyDomainGrouping,
    applySubGrouping,
    assignChildrenToSubGroupsBySemantic,
    normalizeSubGroupDomainByChildren,
    ensureMeasuredForNodes,
    centerSubGroupsInDomain
} from '../utils/layoutUtils';
import {
    calculateBounds,
    layoutWithDagre,
    mapEdgesToContainers,
} from './DomainDagreLayoutHelpers';
import {
    prepareDomainDagreEdges,
} from './DomainDagreEdgePreparation';
import {
    getDomainDagreNodeDimensions,
    getDomainDagreSubDomainOrderIndex,
    normalizeDomainDagreNodes,
    resolveDomainDagreLayoutBoundary,
} from './domainDagreLayoutBoundary';
import {
    buildDomainDagreMembership,
    convertDomainDagreToHierarchy,
    domainDagreDomainOf,
    isDomainDagreGroupNode,
    isDomainDagreNodeHidden,
    sortDomainDagreHierarchy,
    sortDomainDagreSubGroups,
} from './domainDagreHierarchy';
import { runDomainDagreSimplifiedPath } from './domainDagreSimplifiedPaths';
import { runDomainDagreTopLevelLayout } from './domainDagreTopLevelLayout';
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
        edges = Array.isArray(edges) ? edges : [];
        const cfg = diagramConfigManager.getConfig() || {};
        const layoutCfg = diagramConfigManager.getLayoutConfig();
        const boundary = resolveDomainDagreLayoutBoundary(cfg, layoutCfg, options);
        const normalizedNodes = normalizeDomainDagreNodes(
            nodes,
            boundary.defaultNodeWidth,
            boundary.defaultNodeHeight,
        );
        if (normalizedNodes.length === 0) return { nodes: [], edges };
        const num = (value: unknown, fallback: number) => (
            typeof value === 'number' && Number.isFinite(value) ? value : fallback
        );
        const {
            domainGap,
            nodeGapH,
            nodeGapV,
            direction,
            subDomainNodeDirection,
            domainSubGroupDirection,
            titleSafe,
            bottomSafe,
            sideSafeGap,
            bottomSafeGap,
            widthCompensation,
            domainPaddingH: dPadH,
            domainPaddingV: dPadV,
            subDomainPaddingH: sdPadH,
            subDomainPaddingV: sdPadV,
            subDomainPaddingBottom: sdBottomSafe,
            subDomainTitleH: sdTitleH,
            domainTitleH: dTitleH,
            defaultNodeWidth: defaultNodeW,
            defaultNodeHeight: defaultNodeH,
            domainWhitelist,
            subDomainWhitelist: subWhitelist,
            showDomainGroups: showDomain,
            showSubDomainGroups: showSub,
            domainOrder: domainOrderArr,
            subDomainOrder: subDomainOrderOpt,
        } = boundary;
        const isHorizontal = direction === 'LR' || direction === 'RL';
        const subDomainNodeIsHorizontal = subDomainNodeDirection === 'LR' || subDomainNodeDirection === 'RL';
        const domainSubGroupIsHorizontal = domainSubGroupDirection === 'LR' || domainSubGroupDirection === 'RL';

        // 安全边距：用于补偿节点实际渲染宽度与预计算宽度的差异
        // 将安全边距直接应用，确保对称
        const BOUNDS_SAFETY_MARGIN = sideSafeGap;
        const HALF_SAFETY_MARGIN = BOUNDS_SAFETY_MARGIN;
        // 实际水平内边距 = 配置内边距 + 半安全边距
        const sdPadHEffective = sdPadH + HALF_SAFETY_MARGIN;
        const dPadHEffective = dPadH + HALF_SAFETY_MARGIN;

        const getNodeDimensions = (node: ReactFlowNode): { width: number; height: number } => {
            return getDomainDagreNodeDimensions(node, defaultNodeW, defaultNodeH);
        };
        const getSubDomainOrderIndex = (domainKey: string, subKey: string): number => {
            return getDomainDagreSubDomainOrderIndex(subDomainOrderOpt, domainKey, subKey);
        };

        // 应用域/子域分组和白名单过滤 (使用归一化后的节点以确保尺寸一致)
        let processedNodes: ReactFlowNode[] = normalizedNodes as ReactFlowNode[];
        processedNodes = applyDomainGrouping(processedNodes as any, domainWhitelist) as any;
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
                clone.hidden = !visible;
            }
            if (String(n.type || '') === 'titleGroup') {
                const dKey = String(((clone.data?.domain || '') || '')).trim();
                const inWhiteDom = Array.isArray(domainWhitelist) ? domainWhitelist.includes(dKey) : false;
                const visibleDom = showDomain ? (Array.isArray(domainWhitelist) ? inWhiteDom : true) : false;
                clone.data.hidden = !visibleDom;
                clone.hidden = !visibleDom;
            }
            return clone as ReactFlowNode;
        });

        let updatedNodes = normalizeDomainDagreNodes(processedNodes, defaultNodeW, defaultNodeH);

        // 构建辅助函数
        const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n]));
        const domainOf = domainDagreDomainOf;

        // [FIX] 忽略 RF measured，只用 style 确保一致性

        // 辅助函数：检查节点是否隐藏
        const isHidden = isDomainDagreNodeHidden;

        // 分类节点（过滤掉隐藏的节点）
        const domains = updatedNodes.filter(n => String(n.type || '') === 'titleGroup' && !isHidden(n));
        const subGroups = updatedNodes.filter(n => String(n.type || '') === 'subGroup' && !isHidden(n));
        const leafNodes = updatedNodes.filter(n => !isDomainDagreGroupNode(n) && !isHidden(n));

        // [FIX] 构建域排序索引并按 domainOrder 排序域容器
        const domainsByScan: string[] = [];
        domains.forEach(d => {
            const dk = domainOf(d);
            if (dk && !domainsByScan.includes(dk)) domainsByScan.push(dk);
        });
        const domainOrderIndex = new Map<string, number>(
            (Array.isArray(domainOrderArr) && domainOrderArr.length ? domainOrderArr : domainsByScan)
                .map((d, i) => [String(d).trim(), i] as const)
        );
        domains.sort((a, b) => {
            const ai = domainOrderIndex.get(domainOf(a)) ?? Infinity;
            const bi = domainOrderIndex.get(domainOf(b)) ?? Infinity;
            return ai - bi;
        });

        const simplifiedResult = runDomainDagreSimplifiedPath({
            nodes: updatedNodes,
            edges,
            domains,
            subGroups,
            leafNodes,
            idMap,
            routingConfig: cfg,
            options,
            isHorizontal,
            subDomainNodeIsHorizontal,
            domainSubGroupIsHorizontal,
            nodeGapH,
            nodeGapV,
            subDomainPaddingH: sdPadHEffective,
            subDomainPaddingV: sdPadV,
            subDomainPaddingBottom: sdBottomSafe,
            subDomainTitleHeight: sdTitleH,
            titleSafetyGap: titleSafe,
            widthCompensation,
            getNodeDimensions,
        });
        if (simplifiedResult) return simplifiedResult;

        // 构建归属关系
        const {
            childrenBySubGroup: childrenBySub,
            nodeToSubGroup,
        } = buildDomainDagreMembership(updatedNodes, subGroups);

        const moveSubGroupWithChildren = (sg: ReactFlowNode, deltaX: number, deltaY: number) => {
            if (Math.abs(deltaX) <= 0.5 && Math.abs(deltaY) <= 0.5) return;
            (childrenBySub.get(sg.id) || []).forEach(childId => {
                const child = idMap.get(childId);
                if (!child) return;
                child.position = {
                    x: child.position.x + deltaX,
                    y: child.position.y + deltaY
                };
            });
            sg.position = {
                x: sg.position.x + deltaX,
                y: sg.position.y + deltaY
            };
        };

        const expandDomainToContainFinalChildren = (domain: ReactFlowNode) => {
            const dk = domainOf(domain);
            if (!dk) return;

            let maxRight = -Infinity;
            let maxBottom = -Infinity;

            updatedNodes.forEach(n => {
                if (n.id === domain.id) return;
                if (domainOf(n) !== dk) return;
                if (isHidden(n)) return;
                if (String(n.type || '') === 'titleGroup') return;
                if (nodeToSubGroup.has(n.id)) return;

                const dims = getNodeDimensions(n);
                maxRight = Math.max(maxRight, n.position.x + dims.width);
                maxBottom = Math.max(maxBottom, n.position.y + dims.height);
            });

            if (!isFinite(maxRight) || !isFinite(maxBottom)) return;

            const curW = num((domain as any).style?.width ?? (domain as any).measured?.width, 0);
            const curH = num((domain as any).style?.height ?? (domain as any).measured?.height, 0);
            const needW = maxRight - domain.position.x + dPadHEffective;
            const needH = maxBottom - domain.position.y + dPadV + bottomSafe + bottomSafeGap;
            const finalW = Math.max(curW, needW);
            const finalH = Math.max(curH, needH);

            if (finalW > curW || finalH > curH) {
                (domain as any).measured = { width: finalW, height: finalH };
                (domain as any).style = { ...(domain as any).style, width: finalW, height: finalH };
            }
        };

        const packDomainSubGroupsHorizontally = () => {
            if (!domainSubGroupIsHorizontal) return;

            const currentDomains = updatedNodes.filter(n => String(n.type || '') === 'titleGroup' && !isHidden(n));
            currentDomains.forEach(domain => {
                const dk = domainOf(domain);
                if (!dk) return;

                const domainSubGroups = sortDomainDagreSubGroups(
                    updatedNodes.filter(n =>
                        String(n.type || '') === 'subGroup' &&
                        !isHidden(n) &&
                        domainOf(n) === dk
                    ),
                    dk,
                    subDomainOrderOpt,
                );

                if (domainSubGroups.length <= 1) {
                    expandDomainToContainFinalChildren(domain);
                    return;
                }

                const targetY = Math.min(
                    ...domainSubGroups.map(sg => num((sg as any)?.position?.y, domain.position.y + dTitleH + titleSafe + dPadV))
                );
                let cursorX = domain.position.x + dPadHEffective;

                for (const sg of domainSubGroups) {
                    const deltaX = cursorX - num((sg as any)?.position?.x, cursorX);
                    const deltaY = targetY - num((sg as any)?.position?.y, targetY);
                    moveSubGroupWithChildren(sg, deltaX, deltaY);

                    const sgWidth = num((sg as any)?.style?.width ?? (sg as any)?.measured?.width, 0);
                    cursorX += sgWidth + nodeGapH;
                }

                expandDomainToContainFinalChildren(domain);
            });
        };

        const reflowSubGroupChildrenAtCurrentPositions = () => {
            childrenBySub.forEach((_children, sgId) => {
                const sg = idMap.get(sgId);
                if (!sg) return;
                if (isHidden(sg)) return;

                const sgChildren = (childrenBySub.get(sg.id) || [])
                    .map(id => idMap.get(id))
                    .filter(Boolean) as ReactFlowNode[];

                if (sgChildren.length === 0) return;

                const sgEdges = edges.filter(e =>
                    sgChildren.some(n => n.id === e.source) &&
                    sgChildren.some(n => n.id === e.target)
                );

                const result = layoutWithDagre(
                    sgChildren,
                    sgEdges,
                    subDomainNodeIsHorizontal ? 'LR' : 'TB',
                    subDomainNodeIsHorizontal ? nodeGapV : nodeGapH,
                    subDomainNodeIsHorizontal ? nodeGapH : nodeGapV,
                    getNodeDimensions
                );

                const baseX = sg.position.x;
                const baseY = sg.position.y;
                result.forEach(pos => {
                    const node = idMap.get(pos.id);
                    if (!node) return;
                    node.position = {
                        x: baseX + sdPadHEffective + pos.x,
                        y: baseY + sdTitleH + titleSafe + sdPadV + pos.y,
                    };
                });

                const bounds = calculateBounds(sgChildren, getNodeDimensions, widthCompensation);
                const nextWidth = bounds.width + sdPadHEffective * 2;
                const nextHeight = bounds.height + sdTitleH + titleSafe + sdPadV * 2 + bottomSafe;
                const curWidth = num((sg as any).style?.width ?? (sg as any).measured?.width, 0);
                const curHeight = num((sg as any).style?.height ?? (sg as any).measured?.height, 0);
                const finalWidth = Math.max(curWidth, nextWidth);
                const finalHeight = Math.max(curHeight, nextHeight);
                (sg as any).measured = { width: finalWidth, height: finalHeight };
                (sg as any).style = { ...(sg as any).style, width: finalWidth, height: finalHeight };
            });
        };

        // ============================================
        // 第一阶段：域内部布局（每个域单独使用 Dagre）
        // ============================================

        // 先将所有域位置初始化为 (0, 0)，内部布局相对于域原点
        domains.forEach(domain => {
            domain.position = { x: 0, y: 0 };
        });

        domains.forEach(domain => {
            const dk = domainOf(domain);

            // 获取该域下的所有子域（按 subDomainOrder 排序）
            const domainSubGroups = subGroups.filter(sg => domainOf(sg) === dk);
            domainSubGroups.sort((a, b) => {
                const aKey = String(((a as any)?.data?.subDomain || (a as any)?.data?.description || '')).trim();
                const bKey = String(((b as any)?.data?.subDomain || (b as any)?.data?.description || '')).trim();
                return getSubDomainOrderIndex(dk, aKey) - getSubDomainOrderIndex(dk, bKey);
            });

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
                    const result = layoutWithDagre(
                        sgChildren,
                        sgEdges,
                        subDomainNodeIsHorizontal ? 'LR' : 'TB',
                        subDomainNodeIsHorizontal ? nodeGapV : nodeGapH,
                        subDomainNodeIsHorizontal ? nodeGapH : nodeGapV,
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
                    const bounds = calculateBounds(sgChildren, getNodeDimensions, widthCompensation);
                    const sgWidth = bounds.width + sdPadHEffective * 2;
                    const sgHeight = bounds.height + sdTitleH + sdPadV * 2;

                    // 调试：打印子域边界计算详情

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
                const domainChildIds = new Set(domainChildren.map(c => c.id));
                const domainEdges = edges.filter(e => {
                    const src = idMap.get(e.source);
                    const tgt = idMap.get(e.target);
                    if (!src || !tgt) return false;
                    if (domainOf(src) !== dk || domainOf(tgt) !== dk) return false;

                    // Leaf-to-leaf edges inside subdomains must still participate in
                    // domain-level layout after being lifted to their subGroup containers.
                    // Without this, subdomains appear disconnected and Dagre spreads them
                    // horizontally in one rank, stretching the domain container.
                    const srcItem = nodeToSubGroup.get(e.source) || e.source;
                    const tgtItem = nodeToSubGroup.get(e.target) || e.target;
                    return domainChildIds.has(srcItem) && domainChildIds.has(tgtItem);
                });

                // 使用 Dagre 布局域内元素
                const result = layoutWithDagre(
                    domainChildren,
                    mapEdgesToContainers(domainEdges, nodeToSubGroup),
                    domainSubGroupIsHorizontal ? 'LR' : 'TB',
                    domainSubGroupIsHorizontal ? nodeGapV : nodeGapH,
                    domainSubGroupIsHorizontal ? nodeGapH : nodeGapV,
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

                if (domainSubGroupIsHorizontal && domainSubGroups.length > 1) {
                    const rowY = Math.min(...domainSubGroups.map(sg => num((sg as any)?.position?.y, dTitleH + titleSafe + dPadV)));
                    let cursorX = dPadHEffective;
                    for (const sg of domainSubGroups) {
                        const oldX = num((sg as any)?.position?.x, 0);
                        const oldY = num((sg as any)?.position?.y, 0);
                        const deltaX = cursorX - oldX;
                        const deltaY = rowY - oldY;

                        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                            (childrenBySub.get(sg.id) || []).forEach(childId => {
                                const child = idMap.get(childId);
                                if (!child) return;
                                child.position = {
                                    x: child.position.x + deltaX,
                                    y: child.position.y + deltaY
                                };
                            });
                            sg.position = { x: cursorX, y: rowY };
                        }

                        const sgWidth = num((sg as any)?.style?.width ?? (sg as any)?.measured?.width, 0);
                        cursorX += sgWidth + nodeGapH;
                    }
                }

                // 计算域尺寸（使用有效内边距确保左右对称）
                // 注意：只使用 domainChildren（子域 + 自由节点）来计算边界
                // 因为子域的 measured 已经包含了内部节点的尺寸
                // 而叶节点的 position 是相对于父子域的，不能直接加入域边界计算
                // 计算域尺寸（包含标题高度、安全边距、底部缓冲区以及全局 bottomSafeGap 补偿）
                const bounds = calculateBounds(domainChildren, getNodeDimensions, widthCompensation);
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
        updatedNodes = centerSubGroupsInDomain(updatedNodes);

        // 更新节点映射以保持引用同步
        idMap.clear();
        updatedNodes.forEach(n => idMap.set(n.id, n));


        runDomainDagreTopLevelLayout({
            nodes: updatedNodes,
            edges,
            domains: updatedNodes.filter(n => String(n.type || '') === 'titleGroup' && !isHidden(n)),
            leafNodes,
            nodeById: idMap,
            nodeToSubGroup,
            domainOrder: domainOrderArr ?? [],
            domainOrderIndex,
            isHorizontal,
            domainGap,
            getNodeDimensions,
        });

        // ============================================
        // 子域整体居中处理（在所有域级布局完成后）
        // ============================================

        updatedNodes = centerSubGroupsInDomain(updatedNodes);

        // 更新节点映射以保持引用同步
        idMap.clear();
        updatedNodes.forEach(n => idMap.set(n.id, n));
        reflowSubGroupChildrenAtCurrentPositions();
        packDomainSubGroupsHorizontally();

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
        const finalRoutedEdges = await prepareDomainDagreEdges({
            nodes: updatedNodes,
            edges,
            options,
            config: cfg,
            nodeById: idMap,
            leafNodes,
        });
        updatedNodes = sortDomainDagreHierarchy(
            convertDomainDagreToHierarchy(updatedNodes, nodeToSubGroup),
        );

        return { nodes: updatedNodes, edges: finalRoutedEdges };
    }


}

export default DomainDagreLayoutStrategy;
