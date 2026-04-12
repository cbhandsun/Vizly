/**
 * 端口选择器
 * 
 * 职责:
 * - 生成候选端口组合
 * - 评估每个组合的适用性
 * - 选择最佳端口对
 * 
 * 已同步 HandlePicker 中的逻辑:
 * - 反向边同侧处理
 * - 严格水平/垂直模式过滤
 * - U型和Z型避免
 */

import type {
    NodeGeometry,
    PortCandidate,
    PortSelectionResult,
    RoutingConfig,
    EdgeRoutingWeights,
    PortUsage,
    GeometryAnalysis
} from '../types/routing';

import { geometryAnalyzer } from './GeometryAnalyzer';
import { costEvaluator } from './CostEvaluator';

export class PortSelector {
    /**
     * 选择最佳端口组合
     */
    selectOptimalPorts(
        sourceNode: NodeGeometry,
        targetNode: NodeGeometry,
        config: RoutingConfig,
        weights: EdgeRoutingWeights,
        usage?: PortUsage,
        geometryInfo?: GeometryAnalysis
    ): PortSelectionResult {
        // 0. 几何分析
        const geo = geometryInfo || geometryAnalyzer.analyze(sourceNode, targetNode, config.layoutDirection);

        // 1. 生成候选端口
        const candidates = this.generateCandidates(
            sourceNode,
            targetNode,
            config,
            geo
        );

        // 2. 评估每个候选
        let bestCandidate: { candidate: PortCandidate, cost: number } | null = null;
        let bestCost = Infinity;

        for (const candidate of candidates) {
            const result = costEvaluator.evaluate({
                sNode: sourceNode,
                tNode: targetNode,
                sDir: candidate.source,
                tDir: candidate.target,
                dx: geo.dx,
                dy: geo.dy,
                config: config,
                weights: weights,
                baseCost: 0,
                obstacles: [] // 注意：CostEvaluator 内部目前暂不处理障碍物，如果需要可以传入
            });

            if (result.totalCost < bestCost) {
                bestCost = result.totalCost;
                bestCandidate = { candidate, cost: bestCost };
            }
        }

        if (!bestCandidate) {
            // 回退到默认
            const defaultCand = this.getDefaultPorts(geo);
            bestCandidate = { candidate: defaultCand, cost: 0 };
        }

        return {
            sourceHandle: bestCandidate.candidate.source,
            targetHandle: bestCandidate.candidate.target,
            cost: bestCost,
            autoSource: true,
            autoTarget: true
        };
    }

    /**
     * 生成候选端口组合 (核心逻辑 sync with HandlePicker)
     */
    private generateCandidates(
        sourceNode: NodeGeometry,
        targetNode: NodeGeometry,
        config: RoutingConfig,
        geo: GeometryAnalysis
    ): PortCandidate[] {
        let candidates: PortCandidate[] = [
            { source: 'r', target: 'l' },
            { source: 'l', target: 'r' },
            { source: 'b', target: 't' },
            { source: 't', target: 'b' },
            { source: 'r', target: 't' },
            { source: 'r', target: 'b' },
            { source: 'l', target: 't' },
            { source: 'l', target: 'b' },
            { source: 't', target: 'r' },
            { source: 'b', target: 'r' },
            { source: 't', target: 'l' },
            { source: 'b', target: 'l' },
            // Same-side candidates (needed for U-turns / Backward edges)
            { source: 't', target: 't' },
            { source: 'b', target: 'b' },
            { source: 'l', target: 'l' },
            { source: 'r', target: 'r' }
        ];

        const isTB = geo.layoutDirection?.includes('TB');
        const isBT = geo.layoutDirection?.includes('BT');

        // 反向边处理 (Backwards Logic)
        if (geo.isBackwards && (isTB || isBT)) {
            const sidePrimary = geo.dx >= 0 ? 'r' : 'l';
            const altSide = sidePrimary === 'r' ? 'l' : 'r';
            const preferred = [
                { source: sidePrimary, target: sidePrimary },
                { source: altSide, target: altSide }
            ];

            // 优先添加首选组合
            candidates = [
                ...preferred,
                ...candidates.filter(c => !preferred.some(p => p.source === c.source && p.target === c.target))
            ];
        }

        // 严格水平处理 (Strict Horizontal Logic)
        // 防止在垂直布局中的 Z-shape
        const absDxCenter = Math.abs(geo.dx);
        const absDyCenter = Math.abs(geo.dy);
        const isStrictHorizontal = absDxCenter > Math.max(absDyCenter, 30) * 1.1 && absDxCenter > 100;

        if (isStrictHorizontal && (isTB || isBT)) {
            // Forward Horizontal: Restrict to Side ports only
            const filtered = candidates.filter(c =>
                (c.source === 'l' || c.source === 'r') &&
                (c.target === 'l' || c.target === 'r')
            );

            if (filtered.length > 0) {
                candidates = filtered;
            } else {
                const bestH = geo.dx >= 0 ? { source: 'r', target: 'l' } : { source: 'l', target: 'r' };
                candidates = [bestH];
            }
        }

        // 自动添加几何上的首选组合到最前面 (Geometric Primary)
        const primary = this.getPrimaryCandidate(geo);
        if (primary) {
            candidates = [
                primary,
                ...candidates.filter(c => !(c.source === primary.source && c.target === primary.target))
            ];
        }

        // 预分配端口支持 (Pre-assigned Ports)
        if (config.preAssignedPorts) {
            const sPre = config.preAssignedPorts[sourceNode.id]?.source;
            const tPre = config.preAssignedPorts[targetNode.id]?.target;
            if (sPre && tPre) {
                const pre = { source: sPre, target: tPre };
                const exists = candidates.some(c => c.source === pre.source && c.target === pre.target);
                if (!exists) candidates.push(pre);
            }
        }

        return this.deduplicateCandidates(candidates);
    }

    /**
     * 获取主要候选(基于几何关系)
     */
    private getPrimaryCandidate(geo: GeometryAnalysis): PortCandidate | null {
        const layoutDir = geo.layoutDirection;

        if (layoutDir.includes('TB')) {
            return geo.dy >= 0 ? { source: 'b', target: 't' } : { source: 't', target: 'b' };
        } else if (layoutDir.includes('BT')) {
            return geo.dy <= 0 ? { source: 't', target: 'b' } : { source: 'b', target: 't' };
        } else if (layoutDir.includes('LR')) {
            return geo.dx >= 0 ? { source: 'r', target: 'l' } : { source: 'l', target: 'r' };
        } else if (layoutDir.includes('RL')) {
            return geo.dx <= 0 ? { source: 'l', target: 'r' } : { source: 'r', target: 'l' };
        }

        return null;
    }

    /**
     * 获取默认端口(回退方案)
     */
    private getDefaultPorts(geo: GeometryAnalysis): PortCandidate {
        if (geo.isHorizontalDominant) {
            return geo.dx >= 0 ? { source: 'r', target: 'l' } : { source: 'l', target: 'r' };
        } else {
            return geo.dy >= 0 ? { source: 'b', target: 't' } : { source: 't', target: 'b' };
        }
    }

    /**
     * 去除重复候选
     */
    private deduplicateCandidates(candidates: PortCandidate[]): PortCandidate[] {
        const seen = new Set<string>();
        return candidates.filter(c => {
            const key = `${c.source}-${c.target}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}

// 单例实例
export const portSelector = new PortSelector();
