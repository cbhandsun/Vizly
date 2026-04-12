/**
 * 成本评估器
 * 
 * 职责:
 * - 计算路径成本
 * - 应用权重系统
 * - 支持插件扩展
 */

import type {
    CostContext,
    CostResult,
    EdgeRoutingWeights,
    Point,
    Rectangle,
    RoutingPlugin
} from '../types/routing';

import { geometryAnalyzer } from './GeometryAnalyzer';

export class CostEvaluator {
    private plugins: RoutingPlugin[] = [];

    /**
     * 注册成本插件
     */
    registerPlugin(plugin: RoutingPlugin): void {
        this.plugins.push(plugin);
        this.plugins.sort((a, b) => b.priority - a.priority);
    }

    /**
     * 评估总成本
     */
    evaluate(context: CostContext): CostResult {
        const breakdown: CostResult['breakdown'] = {
            length: 0,
            turns: 0,
            crossings: 0,
            direction: 0,
            usage: 0
        };

        // 1. 基础成本
        breakdown.length = this.evaluateLength(context);
        breakdown.turns = this.evaluateTurns(context);
        breakdown.crossings = this.evaluateCrossings(context);
        breakdown.direction = this.evaluateDirection(context);
        breakdown.usage = this.evaluateUsage(context);

        // 2. 插件成本
        let pluginCost = 0;
        for (const plugin of this.plugins) {
            if (!plugin.canApply || plugin.canApply(context)) {
                const cost = plugin.evaluate(context);
                pluginCost += cost;
                breakdown[plugin.name] = cost;
            }
        }

        const totalCost =
            breakdown.length +
            breakdown.turns +
            breakdown.crossings +
            breakdown.direction +
            breakdown.usage +
            pluginCost;

        return {
            totalCost,
            breakdown
        };
    }

    /**
     * 评估路径长度成本 (使用曼哈顿距离)
     */
    private evaluateLength(context: CostContext): number {
        const { sNode, tNode, weights, sDir, tDir } = context;

        const sa = geometryAnalyzer.getHandleAnchor(sNode, sDir);
        const ta = geometryAnalyzer.getHandleAnchor(tNode, tDir);

        // 使用曼哈顿距离估算: |dx| + |dy|
        const length = Math.abs(ta.x - sa.x) + Math.abs(ta.y - sa.y);

        return length * weights.length;
    }

    /**
     * 评估转弯成本
     */
    private evaluateTurns(context: CostContext): number {
        const { sDir, tDir, weights } = context;

        // 简化:如果源和目标方向不同(e.g., r -> b)，意味着至少 1 次转弯
        // 如果方向相同 (e.g., r -> r)，通常意味着 0 或 2 次转弯(U-turn)
        // 这里只给出一个基础估计
        if (sDir !== tDir) {
            return weights.turn;
        }

        return 0;
    }

    /**
     * 评估穿越障碍物成本
     */
    private evaluateCrossings(context: CostContext): number {
        const { sNode, tNode, sDir, tDir, obstacles, weights } = context;

        if (!obstacles || obstacles.length === 0) {
            return 0;
        }

        const sa = geometryAnalyzer.getHandleAnchor(sNode, sDir);
        const ta = geometryAnalyzer.getHandleAnchor(tNode, tDir);

        // 简单检测:直线路径是否穿过障碍物
        let crossings = 0;
        for (const obs of obstacles) {
            if (this.lineIntersectsRect(sa, ta, obs)) {
                crossings++;
            }
        }

        return crossings * weights.crossing;
    }

    /**
     * 评估方向成本 - 包含核心逻辑 (反向、L型、Z型、Flow等)
     */
    private evaluateDirection(context: CostContext): number {
        const { sDir, tDir, dx, dy, weights, config } = context;
        const layoutDir = config.layoutDirection || 'LR';

        let penalty = 0;
        const isTB = layoutDir.includes('TB');
        const isBT = layoutDir.includes('BT');
        const isLR = layoutDir.includes('LR');
        const isRL = layoutDir.includes('RL');

        const WRONG_AXIS_PENALTY = 2000;
        const PREFERRED_AXIS_BONUS = 1200;
        const L_SHAPE_BONUS = 1500;
        const CROSS_AXIS_PENALTY = 800;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // 检测反向边
        const isBackwards = geometryAnalyzer.isBackwardsEdge(layoutDir, dx, dy);

        // 1. 基础方向校验 (Base Wrong Direction)
        // 检查源/目标端口是否指向"背离"对方
        // e.g., Source Right (r) but Target is Left (dx < 0)
        const THRESHOLD = 10;
        const isBadDir = (dir: string, delta: number) => {
            // handle direction vs delta
            // 'l' expects delta < 0
            if (dir === 'l' && delta > THRESHOLD) return true;
            // 'r' expects delta > 0
            if (dir === 'r' && delta < -THRESHOLD) return true;
            // 't' expects delta < 0 (assuming y gets smaller going up? No, usually y is down)
            // Wait, Coordinate system: y increases downwards.
            // 't' points UP (decreases y), so deltaY should be < 0
            if (dir === 't' && delta > THRESHOLD) return true;
            // 'b' points DOWN (increases y), so deltaY should be > 0
            if (dir === 'b' && delta < -THRESHOLD) return true;
            return false;
        };

        const sBad = isBadDir(sDir, (sDir === 'l' || sDir === 'r') ? dx : dy);
        // target vector is FROM t TO s? No, we look at vector S->T (dx, dy)
        // But target handle points OUT from target.
        // If we enter target from Left, we need 'l' handle? No, 'l' handle points Left means we enter from Left.
        // So 'l' handle is compatible with arriving from Left (dx > 0).
        const tBad = isBadDir(tDir, (tDir === 'l' || tDir === 'r') ? -dx : -dy); // Reverse vector for target

        // Policy 'prefer' vs 'force'
        if (config.directionalHandlePolicy === 'force' && !isBackwards) {
            // Force mode: mask 'bad' flag if it matches layout direction side-effects? 
            // Actually HandlePicker logic is complex here.
            // Simplified: If 'force', we rely heavily on WRONG_AXIS_PENALTY
        } else {
            if (sBad) penalty += (weights.wrongSign || 2000);
            if (tBad) penalty += (weights.wrongSign || 2000);
        }

        // 2. 几何主导轴判断 (Geometric Dominance)
        const DOMINANCE_RATIO = 1.1;
        const MIN_DOMINANT_DISTANCE = 100;
        const MIN_CROSS_AXIS = 30;

        const effectiveDy = Math.max(absDy, MIN_CROSS_AXIS);
        const effectiveDx = Math.max(absDx, MIN_CROSS_AXIS);

        const horizontalDominates = absDx > effectiveDy * DOMINANCE_RATIO && absDx > MIN_DOMINANT_DISTANCE;
        const verticalDominates = absDy > effectiveDx * DOMINANCE_RATIO && absDy > MIN_DOMINANT_DISTANCE;

        // 3. 布局方向 vs 几何 (Tie-breaking)
        if (isTB || isBT) {
            if (horizontalDominates) {
                // 水平主导 (长距离左右连线) -> 鼓励使用水平端口 (l/r)
                if (tDir === 'l' || tDir === 'r') penalty -= PREFERRED_AXIS_BONUS;
                if (sDir === 'l' || sDir === 'r') penalty -= PREFERRED_AXIS_BONUS;
            } else {
                // 垂直主导 -> 鼓励垂直端口 (t/b)
                if (!isBackwards) {
                    // 标准垂直流
                    if (sDir === 'l' || sDir === 'r') penalty += WRONG_AXIS_PENALTY;
                    if (tDir === 'l' || tDir === 'r') penalty += WRONG_AXIS_PENALTY;
                }
            }
        } else if (isLR || isRL) {
            if (verticalDominates) {
                // 垂直主导 -> 鼓励垂直端口
                if (sDir === 'l' || sDir === 'r') penalty += WRONG_AXIS_PENALTY;
                if (tDir === 'l' || tDir === 'r') penalty += WRONG_AXIS_PENALTY;

                if (sDir === 't' || sDir === 'b') penalty -= PREFERRED_AXIS_BONUS;
                if (tDir === 't' || tDir === 'b') penalty -= PREFERRED_AXIS_BONUS;
            } else {
                // 水平主导 -> 鼓励水平端口
                if (!isBackwards) {
                    if (sDir === 't' || sDir === 'b') penalty += WRONG_AXIS_PENALTY;
                    if (tDir === 't' || tDir === 'b') penalty += WRONG_AXIS_PENALTY;
                }
            }
        }

        // 4. 反向边特殊处理 (Backwards Edge)
        if (isBackwards && (isTB || isBT)) {
            // 鼓励 Cross-Side 或 Same-Side 回路
            // Cross-Side: r -> l
            if ((sDir === 'r' && tDir === 'l') || (sDir === 'l' && tDir === 'r')) {
                penalty -= 3500;
            }
            // Same-Side: r -> r
            if ((sDir === 'r' && tDir === 'r') || (sDir === 'l' && tDir === 'l')) {
                penalty -= 2500;
            }

            // 惩罚 Bottom 出口 (会导致不必要的绕行)
            if (sDir === 'b') penalty += 3500;
        }

        // 5. L-Shape 奖励
        // 垂直线 + 水平线 (e.g. Bottom -> Left)
        const isLShape =
            ((sDir === 't' || sDir === 'b') && (tDir === 'l' || tDir === 'r')) ||
            ((sDir === 'l' || sDir === 'r') && (tDir === 't' || tDir === 'b'));

        if (isLShape) {
            penalty -= (weights.lShapeBonus || L_SHAPE_BONUS);
        }

        return penalty;
    }

    /**
     * 评估端口使用成本 (智能端口分布优化)
     * 
     * [ENHANCED] 使用更激进的惩罚策略：
     * - 0-2条边: 线性惩罚
     * - 3+条边: 指数惩罚 (幂次2.5)
     * 
     * 这样可以强烈鼓励边使用不同的端口，避免重叠。
     */
    private evaluateUsage(context: CostContext): number {
        const { weights, usage, sDir, tDir } = context;
        if (!usage) return 0;

        const sUsage = usage.source?.[sDir] || 0;
        const tUsage = usage.target?.[tDir] || 0;

        // [NEW] 激进惩罚策略 - 超过阈值时指数增长
        const USAGE_THRESHOLD = 2; // 超过2条边共享同一端口时激增惩罚
        const BASE_PENALTY = weights.usagePenalty || 40;

        let sourceCost = 0;
        let targetCost = 0;

        // 源端口惩罚
        if (sUsage > USAGE_THRESHOLD) {
            // 指数惩罚: 3条边 = 3^2.5 * 40 ≈ 622, 4条边 ≈ 1280, 5条边 ≈ 2236
            sourceCost = Math.pow(sUsage, 2.5) * BASE_PENALTY;
        } else {
            // 线性惩罚: 1条边 = 40, 2条边 = 80
            sourceCost = sUsage * BASE_PENALTY;
        }

        // 目标端口惩罚
        if (tUsage > USAGE_THRESHOLD) {
            targetCost = Math.pow(tUsage, 2.5) * BASE_PENALTY;
        } else {
            targetCost = tUsage * BASE_PENALTY;
        }

        return sourceCost + targetCost;
    }

    /**
     * 辅助:检查线段是否与矩形相交
     */
    private lineIntersectsRect(
        p1: Point,
        p2: Point,
        rect: Rectangle
    ): boolean {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        return !(
            maxX < rect.x ||
            minX > rect.x + rect.width ||
            maxY < rect.y ||
            minY > rect.y + rect.height
        );
    }
}

// 单例实例
export const costEvaluator = new CostEvaluator();
