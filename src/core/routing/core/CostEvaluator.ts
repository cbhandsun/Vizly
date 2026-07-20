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
        breakdown.crossings += this.evaluateEdgeCrossings(context);
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
     *
     * [OPT-P1③] 由"方向不同 = 一次固定惩罚"升级为基于端口对的精确转弯次数估算：
     * - 0 次转弯：直通路径 (r→l, l→r, b→t, t→b，且沿正确轴方向)
     * - 1 次转弯：L 形路径 (水平端口 → 垂直端口，或反之)
     * - 2 次转弯：U 形/Z 形 (同侧端口 r→r，或反向端口 r→r 等)
     */
    private evaluateTurns(context: CostContext): number {
        const { sDir, tDir, dx, dy, weights } = context;

        const isHoriz = (d: string) => d === 'l' || d === 'r';
        const isVert  = (d: string) => d === 't' || d === 'b';

        // 同轴直通：源和目标端口轴一致，且方向互相面对
        const straightThrough =
            (sDir === 'r' && tDir === 'l' && dx >= 0) ||
            (sDir === 'l' && tDir === 'r' && dx <= 0) ||
            (sDir === 'b' && tDir === 't' && dy >= 0) ||
            (sDir === 't' && tDir === 'b' && dy <= 0);

        if (straightThrough) return 0;

        // L 形：一个水平端口 + 一个垂直端口
        if ((isHoriz(sDir) && isVert(tDir)) || (isVert(sDir) && isHoriz(tDir))) {
            return weights.turn; // 1 次转弯
        }

        // 同侧端口 (U 形) 或反向同轴 (Z 形) = 2 次转弯
        return weights.turn * 2;
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

        // [P4] AABB 快速剥除：计算 source→target 的路径包围盒
        // 如果该区域内没有任何障碍物，直接返回 0，跳过逐矩形检测。
        // 对于常见的无障碍场景，将 O(N) 降为 O(1)。
        const bboxMinX = Math.min(sa.x, ta.x);
        const bboxMaxX = Math.max(sa.x, ta.x);
        const bboxMinY = Math.min(sa.y, ta.y);
        const bboxMaxY = Math.max(sa.y, ta.y);
        const hasAnyInBbox = (obstacles as any[]).some((obs: any) =>
            obs.x < bboxMaxX && obs.x + obs.width > bboxMinX &&
            obs.y < bboxMaxY && obs.y + obs.height > bboxMinY
        );
        if (!hasAnyInBbox) return 0;

        // 简单检测：直线路径是否穿过障碍物
        let crossings = 0;
        for (const obs of obstacles) {
            if (this.lineIntersectsRect(sa, ta, obs)) {
                crossings++;
            }
        }

        return crossings * weights.crossing;
    }

    /**
     * 评估与已路由边的交叉成本。
     *
     * DomainDagre 会把前面已经确定的路径放进 config.routedPaths。这里仅用
     * 候选端口生成一条轻量的正交估算路径，作为端口选择阶段的软惩罚：
     * 不强制改道，但在成本接近时优先选择少交叉的端口。
     */
    private evaluateEdgeCrossings(context: CostContext): number {
        const routedPaths = context.config.routedPaths;
        if (!routedPaths || routedPaths.length === 0) return 0;

        const candidate = this.buildOrthogonalEstimate(context);
        if (candidate.length < 2) return 0;

        let crossings = 0;
        for (const routed of routedPaths) {
            const points = routed.points;
            if (!points || points.length < 2) continue;
            for (let i = 0; i < candidate.length - 1; i++) {
                for (let j = 0; j < points.length - 1; j++) {
                    if (this.segmentsIntersect(candidate[i], candidate[i + 1], points[j], points[j + 1])) {
                        crossings++;
                    }
                }
            }
        }

        return crossings * (context.weights.edgeCrossing || 80);
    }

    private buildOrthogonalEstimate(context: CostContext): Point[] {
        const { sNode, tNode, sDir, tDir } = context;
        const start = geometryAnalyzer.getHandleAnchor(sNode, sDir);
        const end = geometryAnalyzer.getHandleAnchor(tNode, tDir);
        const isSourceHorizontal = sDir === 'l' || sDir === 'r';
        const isTargetHorizontal = tDir === 'l' || tDir === 'r';

        if (Math.abs(start.x - end.x) < 1 || Math.abs(start.y - end.y) < 1) {
            return [start, end];
        }

        if (isSourceHorizontal && isTargetHorizontal) {
            if (sDir === tDir) {
                const laneX = sDir === 'r'
                    ? Math.max(start.x, end.x) + 48
                    : Math.min(start.x, end.x) - 48;
                return [start, { x: laneX, y: start.y }, { x: laneX, y: end.y }, end];
            }
            const midX = (start.x + end.x) / 2;
            return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
        }
        if (!isSourceHorizontal && !isTargetHorizontal) {
            if (sDir === tDir) {
                const laneY = sDir === 'b'
                    ? Math.max(start.y, end.y) + 48
                    : Math.min(start.y, end.y) - 48;
                return [start, { x: start.x, y: laneY }, { x: end.x, y: laneY }, end];
            }
            const midY = (start.y + end.y) / 2;
            return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
        }

        return isSourceHorizontal
            ? [start, { x: end.x, y: start.y }, end]
            : [start, { x: start.x, y: end.y }, end];
    }

    private segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
        if (this.pointsNear(a, c) || this.pointsNear(a, d) || this.pointsNear(b, c) || this.pointsNear(b, d)) {
            return false;
        }

        const minAx = Math.min(a.x, b.x);
        const maxAx = Math.max(a.x, b.x);
        const minAy = Math.min(a.y, b.y);
        const maxAy = Math.max(a.y, b.y);
        const minCx = Math.min(c.x, d.x);
        const maxCx = Math.max(c.x, d.x);
        const minCy = Math.min(c.y, d.y);
        const maxCy = Math.max(c.y, d.y);
        if (maxAx < minCx || maxCx < minAx || maxAy < minCy || maxCy < minAy) {
            return false;
        }

        const o1 = this.orientation(a, b, c);
        const o2 = this.orientation(a, b, d);
        const o3 = this.orientation(c, d, a);
        const o4 = this.orientation(c, d, b);

        if (o1 === 0 && this.onSegment(a, c, b)) return true;
        if (o2 === 0 && this.onSegment(a, d, b)) return true;
        if (o3 === 0 && this.onSegment(c, a, d)) return true;
        if (o4 === 0 && this.onSegment(c, b, d)) return true;

        return o1 !== o2 && o3 !== o4;
    }

    private orientation(a: Point, b: Point, c: Point): number {
        const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        if (Math.abs(value) < 1e-6) return 0;
        return value > 0 ? 1 : 2;
    }

    private onSegment(a: Point, b: Point, c: Point): boolean {
        return b.x <= Math.max(a.x, c.x) + 1e-6
            && b.x + 1e-6 >= Math.min(a.x, c.x)
            && b.y <= Math.max(a.y, c.y) + 1e-6
            && b.y + 1e-6 >= Math.min(a.y, c.y);
    }

    private pointsNear(a: Point, b: Point): boolean {
        return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
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
        const _CROSS_AXIS_PENALTY = 800;

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

        // 源端口惩罚
        const sourceCost = sUsage > USAGE_THRESHOLD
            // 指数惩罚: 3条边 = 3^2.5 * 40 ≈ 622, 4条边 ≈ 1280, 5条边 ≈ 2236
            ? Math.pow(sUsage, 2.5) * BASE_PENALTY
            // 线性惩罚: 1条边 = 40, 2条边 = 80
            : sUsage * BASE_PENALTY;

        // 目标端口惩罚
        const targetCost = tUsage > USAGE_THRESHOLD
            ? Math.pow(tUsage, 2.5) * BASE_PENALTY
            : tUsage * BASE_PENALTY;

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
