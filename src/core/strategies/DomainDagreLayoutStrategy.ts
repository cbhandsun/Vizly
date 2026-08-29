import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
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
} from './DomainDagreLayoutHelpers';
import {
    prepareDomainDagreEdges,
} from './DomainDagreEdgePreparation';
import {
    getDomainDagreNodeDimensions,
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
import {
    runDomainDagreOrderedLaneLayout,
    runDomainDagreTopLevelLayout,
} from './domainDagreTopLevelLayout';
import { runDomainDagreNestedLayout } from './domainDagreNestedLayout';
import { arrangeDomainDagreChildren } from './domainDagreChildArrangement';
import {
    unifyContainerHeightsByMaximum,
    unifyContainerWidthsByMaximum,
} from './shared/domainContainerSizeNormalization';
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
            domainPlacement,
            nodeArrangement,
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
        // 应用域/子域分组和白名单过滤 (使用归一化后的节点以确保尺寸一致)
        let processedNodes: ReactFlowNode[] = normalizedNodes as ReactFlowNode[];
        processedNodes = applyDomainGrouping(processedNodes, domainWhitelist);
        processedNodes = applySubGrouping(processedNodes, subWhitelist);
        processedNodes = assignChildrenToSubGroupsBySemantic(processedNodes);
        processedNodes = ensureMeasuredForNodes(processedNodes);
        processedNodes = normalizeSubGroupDomainByChildren(processedNodes);

        // 应用显隐性控制
        processedNodes = processedNodes.map(n => {
            const clone: ReactFlowNode = { ...n, data: { ...n.data } };
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

            const curW = num(domain.style?.width ?? domain.measured?.width, 0);
            const curH = num(domain.style?.height ?? domain.measured?.height, 0);
            const needW = maxRight - domain.position.x + dPadHEffective;
            const needH = maxBottom - domain.position.y + dPadV + bottomSafe + bottomSafeGap;
            const finalW = Math.max(curW, needW);
            const finalH = Math.max(curH, needH);

            if (finalW > curW || finalH > curH) {
                domain.measured = { width: finalW, height: finalH };
                domain.style = { ...domain.style, width: finalW, height: finalH };
            }
        };

        const packDomainSubGroupsByDirection = () => {
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

                const targetX = Math.min(
                    ...domainSubGroups.map(sg => num(sg.position.x, domain.position.x + dPadHEffective))
                );
                const targetY = Math.min(
                    ...domainSubGroups.map(sg => num(sg.position.y, domain.position.y + dTitleH + titleSafe + dPadV))
                );
                let cursor = domainSubGroupIsHorizontal
                    ? domain.position.x + dPadHEffective
                    : domain.position.y + dTitleH + titleSafe + dPadV;

                for (const sg of domainSubGroups) {
                    const nextX = domainSubGroupIsHorizontal ? cursor : targetX;
                    const nextY = domainSubGroupIsHorizontal ? targetY : cursor;
                    const deltaX = nextX - num(sg.position.x, nextX);
                    const deltaY = nextY - num(sg.position.y, nextY);
                    moveSubGroupWithChildren(sg, deltaX, deltaY);

                    const dimension = domainSubGroupIsHorizontal
                        ? num(sg.style?.width ?? sg.measured?.width, 0)
                        : num(sg.style?.height ?? sg.measured?.height, 0);
                    cursor += dimension + (domainSubGroupIsHorizontal ? nodeGapH : nodeGapV);
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

                const result = arrangeDomainDagreChildren(
                    sgChildren,
                    sgEdges,
                    nodeArrangement,
                    subDomainNodeIsHorizontal,
                    nodeGapH,
                    nodeGapV,
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
                const curWidth = num(sg.style?.width ?? sg.measured?.width, 0);
                const curHeight = num(sg.style?.height ?? sg.measured?.height, 0);
                const finalWidth = Math.max(curWidth, nextWidth);
                const finalHeight = Math.max(curHeight, nextHeight);
                sg.measured = { width: finalWidth, height: finalHeight };
                sg.style = { ...sg.style, width: finalWidth, height: finalHeight };
            });
        };

        runDomainDagreNestedLayout({
            domains,
            subGroups,
            leafNodes,
            edges,
            nodeById: idMap,
            childrenBySubGroup: childrenBySub,
            nodeToSubGroup,
            subDomainOrder: subDomainOrderOpt,
            subDomainNodeIsHorizontal,
            nodeArrangement,
            domainSubGroupIsHorizontal,
            nodeGapH,
            nodeGapV,
            subDomainPaddingH: sdPadHEffective,
            subDomainPaddingV: sdPadV,
            subDomainTitleHeight: sdTitleH,
            domainPaddingH: dPadHEffective,
            domainPaddingV: dPadV,
            domainTitleHeight: dTitleH,
            titleSafetyGap: titleSafe,
            bottomSafetyGap: bottomSafe,
            globalBottomSafetyGap: bottomSafeGap,
            widthCompensation,
            getNodeDimensions,
        });

        // ============================================
        // 子域整体居中处理
        // ============================================
        // 在域内布局完成、域尺寸确定后,使域内多个子域作为整体相对父域居中
        updatedNodes = centerSubGroupsInDomain(updatedNodes);

        // 更新节点映射以保持引用同步
        idMap.clear();
        updatedNodes.forEach(n => idMap.set(n.id, n));


        const topLevelLayoutContext = {
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
        };
        if (domainPlacement === 'ordered-lanes') {
            runDomainDagreOrderedLaneLayout(topLevelLayoutContext);
        } else {
            runDomainDagreTopLevelLayout(topLevelLayoutContext);
        }

        // ============================================
        // 子域整体居中处理（在所有域级布局完成后）
        // ============================================

        updatedNodes = centerSubGroupsInDomain(updatedNodes);

        // 更新节点映射以保持引用同步
        idMap.clear();
        updatedNodes.forEach(n => idMap.set(n.id, n));
        reflowSubGroupChildrenAtCurrentPositions();
        packDomainSubGroupsByDirection();

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

                const curW = num(domain.style?.width, 0);
                const curH = num(domain.style?.height, 0);
                const needW = maxRight - dx + dPadHEffective;
                const needH = maxBottom - dy + dPadV + bottomSafe + bottomSafeGap;

                if (needW > curW || needH > curH) {
                    const finalW = Math.max(curW, needW);
                    const finalH = Math.max(curH, needH);
                    domain.measured = { width: finalW, height: finalH };
                    domain.style = { ...domain.style, width: finalW, height: finalH };
                }
            }
        }

        // ============================================
        // 第三阶段：智能边路由
        // ============================================
        // Earlier layout phases replace node objects while arranging domains and
        // subgroups. Rebuild the identity map here so port selection and endpoint
        // anchoring never read the pre-layout positions captured by idMap above.
        const routingNodeById = new Map<string, ReactFlowNode>(
            updatedNodes.map(node => [node.id, node]),
        );
        const finalRoutedEdges = await prepareDomainDagreEdges({
            nodes: updatedNodes,
            edges,
            options,
            config: cfg,
            nodeById: routingNodeById,
            leafNodes,
        });
        // Normalizing semantic container sizes cannot change business-node
        // endpoints. Keep it after routing so expanded lane backgrounds never
        // enlarge the route search space.
        if (domainPlacement === 'ordered-lanes') {
            updatedNodes = isHorizontal
                ? unifyContainerWidthsByMaximum(updatedNodes, new Set(['titleGroup']), dTitleH)
                : unifyContainerHeightsByMaximum(updatedNodes, new Set(['titleGroup']), 360);
        }
        updatedNodes = sortDomainDagreHierarchy(
            convertDomainDagreToHierarchy(updatedNodes, nodeToSubGroup),
        );

        return { nodes: updatedNodes, edges: finalRoutedEdges };
    }


}

export default DomainDagreLayoutStrategy;
