import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { LayoutOptions } from '../../types/layout';
import { ILayoutStrategy } from '../LayoutStrategyManager';
import { reflowSubGroupChildrenDagre, applySubGrouping, assignChildrenToSubGroupsBySemantic, applyDomainGrouping, ensureMeasuredForNodes, recomputeSubGroupContainersBasic, enforceDomainContainerStrictContainment, resolveDomainContainerOverlaps, finalizeDomainWidthsByProjection, finalizeDomainHeightsByProjection } from '../../utils/layoutUtils';
import { diagramConfigManager } from '../../config/DiagramConfig';

const stringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every(item => typeof item === 'string')
        ? value
        : undefined;

/**
 * Dagre 分层布局策略（节点布局）
 * 函数级注释：
 * - 使用 dagre 算法对子域内节点进行分层布局
 * - 支持语义顺序（sequence/order）和边关系驱动的分层
 * - 默认使用 TB（从上到下）布局方向
 */
export class DagreLayoutStrategy implements ILayoutStrategy {
    /** 获取策略名称 */
    getName(): string { return 'DagreLayout'; }

    /** 函数级注释：策略类别 - 节点布局 */
    getCategory(): 'hierarchy' | 'node' { return 'node'; }

    /** 获取策略描述 */
    getDescription(): string { return 'Dagre 分层：语义顺序 + 边驱动分层'; }

    /** 适用性检查：只要有节点即可 */
    isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
        return Array.isArray(nodes) && nodes.length > 0;
    }

    /**
     * 计算布局
     * 函数级注释：
     * - 生成域/子域容器
     * - 使用 dagre 对每个子域内的节点进行分层布局
     * - 调整容器尺寸以包含子节点
     */
    async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: Edge[] }> {
        const num = (value: unknown, fallback: number) =>
            typeof value === 'number' && Number.isFinite(value) ? value : fallback;
        const layoutCfg = diagramConfigManager.getLayoutConfig();
        const hGap = num(layoutCfg.NODE_H_GAP, 120);
        const vGap = num(layoutCfg.NODE_V_GAP, 80);
        const optionRecord = options as unknown as Record<string, unknown>;

        // 生成域/子域容器
        let nodesWithGroups: ReactFlowNode[] = nodes;
        if (options?.generateDomainGroups) {
            const domainWhitelist = stringArray(options.domainWhitelist)
                ?? stringArray(optionRecord.domainWhiteList);
            nodesWithGroups = applyDomainGrouping(nodesWithGroups, domainWhitelist);
        }
        const shouldGenSub = Boolean(options?.generateSubDomainGroups);
        const subWhitelist = stringArray(options.subDomainWhitelist);
        nodesWithGroups = shouldGenSub
            ? assignChildrenToSubGroupsBySemantic(applySubGrouping(nodesWithGroups, subWhitelist))
            : assignChildrenToSubGroupsBySemantic(nodesWithGroups);
        nodesWithGroups = ensureMeasuredForNodes(nodesWithGroups);

        let updatedNodes = nodesWithGroups.map(n => ({ ...n }));

        // 对每个子域使用 dagre 布局
        const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
        const sgs = updatedNodes.filter(n => String(n.type || '') === 'subGroup');

        for (const sg of sgs) {
            const ch = stringArray(sg.data.children) ?? [];
            const childNodes = ch
                .map(id => idMap.get(id))
                .filter((node): node is ReactFlowNode => Boolean(node) && node?.data.hidden !== true);
            if (childNodes.length === 0) continue;

            // 使用 dagre 布局子域内节点
            const result = reflowSubGroupChildrenDagre(sg, childNodes, hGap, vGap, edges);

            // 更新节点位置
            const resultMap = new Map(result.map(n => [n.id, n]));
            for (let i = 0; i < updatedNodes.length; i++) {
                const updated = resultMap.get(updatedNodes[i].id);
                if (updated) updatedNodes[i] = updated;
            }
        }

        // 回收容器尺寸
        updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);

        // 域容器处理
        const hasDomainContainers = updatedNodes.some(n => String(n.type || '') === 'titleGroup');
        if (hasDomainContainers) {
            updatedNodes = enforceDomainContainerStrictContainment(updatedNodes);
            updatedNodes = finalizeDomainWidthsByProjection(updatedNodes);
            updatedNodes = finalizeDomainHeightsByProjection(updatedNodes);
            updatedNodes = resolveDomainContainerOverlaps(updatedNodes);
        }

        return { nodes: updatedNodes, edges };
    }
}

export default DagreLayoutStrategy;
