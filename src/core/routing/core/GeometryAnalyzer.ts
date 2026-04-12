/**
 * 几何分析器
 * 
 * 职责:
 * - 分析节点间的几何关系
 * - 判断布局方向
 * - 检测对齐情况
 * - 计算距离和角度
 */

import type {
    Point,
    NodeGeometry,
    GeometryAnalysis,
    AlignmentInfo
} from '../types/routing';

export class GeometryAnalyzer {
    /**
     * 全面分析两个节点的几何关系
     */
    analyze(
        sourceNode: NodeGeometry,
        targetNode: NodeGeometry,
        layoutDirection: string = 'LR'
    ): GeometryAnalysis {
        const sCenter = this.getCenter(sourceNode);
        const tCenter = this.getCenter(targetNode);

        const dx = tCenter.x - sCenter.x;
        const dy = tCenter.y - sCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        const DOMINANCE_RATIO = 1.1; // Matched HandlePicker 'STRONG_DOMINANCE_RATIO'
        const MIN_DOMINANT_DISTANCE = 100;
        const MIN_CROSS_AXIS = 30;

        const effectiveDy = Math.max(absDy, MIN_CROSS_AXIS);
        const effectiveDx = Math.max(absDx, MIN_CROSS_AXIS);

        const isHorizontalDominant = absDx > effectiveDy * DOMINANCE_RATIO && absDx > MIN_DOMINANT_DISTANCE;
        const isVerticalDominant = absDy > effectiveDx * DOMINANCE_RATIO && absDy > MIN_DOMINANT_DISTANCE;

        // Diagonal is implicitly whatever is not dominant
        const isDiagonal = !isHorizontalDominant && !isVerticalDominant;

        const isBackwards = this.isBackwardsEdge(layoutDirection, dx, dy);

        return {
            dx,
            dy,
            distance,
            angle,
            isHorizontalDominant,
            isVerticalDominant,
            isDiagonal,
            isBackwards,
            layoutDirection
        };
    }

    /**
     * 检查是否为反向边
     */
    isBackwardsEdge(
        layoutDir: string,
        dx: number,
        dy: number,
        threshold: number = 5
    ): boolean {
        return (
            (layoutDir.includes('TB') && dy < -threshold) ||
            (layoutDir.includes('BT') && dy > threshold) ||
            (layoutDir.includes('LR') && dx < -threshold) ||
            (layoutDir.includes('RL') && dx > threshold)
        );
    }

    /**
     * 检查节点对齐情况
     */
    analyzeAlignment(
        sourceNode: NodeGeometry,
        targetNode: NodeGeometry,
        threshold: number = 10
    ): AlignmentInfo {
        const sCenter = this.getCenter(sourceNode);
        const tCenter = this.getCenter(targetNode);

        const dx = Math.abs(tCenter.x - sCenter.x);
        const dy = Math.abs(tCenter.y - sCenter.y);

        if (dx < threshold) {
            return {
                isAligned: true,
                alignAxis: 'vertical',
                offset: dx
            };
        }

        if (dy < threshold) {
            return {
                isAligned: true,
                alignAxis: 'horizontal',
                offset: dy
            };
        }

        return {
            isAligned: false,
            alignAxis: 'none',
            offset: Math.min(dx, dy)
        };
    }

    /**
     * 计算节点中心点
     */
    getCenter(node: NodeGeometry): Point {
        const pos = node.position || { x: 0, y: 0 };
        const w = node.dimensions?.width || 0;
        const h = node.dimensions?.height || 0;
        return {
            x: pos.x + w / 2,
            y: pos.y + h / 2
        };
    }

    /**
     * 计算把手锚点位置
     */
    getHandleAnchor(
        node: NodeGeometry,
        direction: string
    ): Point {
        const pos = node.position;
        const w = node.dimensions.width;
        const h = node.dimensions.height;

        // dir may include an offset index, e.g., 'r0', 'r1', 't2'
        const side = direction.charAt(0);
        const offsetStr = direction.slice(1);
        const offsetIdx = offsetStr ? parseInt(offsetStr, 10) : NaN;
        const spacing = 10; // pixels per offset step

        let point: Point;
        switch (side) {
            case 'l':
                point = { x: pos.x, y: pos.y + h / 2 };
                if (!isNaN(offsetIdx)) point.y += offsetIdx * spacing;
                break;
            case 'r':
                point = { x: pos.x + w, y: pos.y + h / 2 };
                if (!isNaN(offsetIdx)) point.y += offsetIdx * spacing;
                break;
            case 't':
                point = { x: pos.x + w / 2, y: pos.y };
                if (!isNaN(offsetIdx)) point.x += offsetIdx * spacing;
                break;
            case 'b':
                point = { x: pos.x + w / 2, y: pos.y + h };
                if (!isNaN(offsetIdx)) point.x += offsetIdx * spacing;
                break;
            default:
                point = { x: pos.x + w / 2, y: pos.y + h / 2 };
        }
        return point;
    }

    /**
     * 检查点是否在矩形内
     */
    isPointInRect(
        point: Point,
        rect: { x: number; y: number; width: number; height: number },
        padding: number = 0
    ): boolean {
        return (
            point.x >= rect.x - padding &&
            point.x <= rect.x + rect.width + padding &&
            point.y >= rect.y - padding &&
            point.y <= rect.y + rect.height + padding
        );
    }

    /**
     * 计算两点距离
     */
    distance(p1: Point, p2: Point): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 计算曼哈顿距离
     */
    manhattanDistance(p1: Point, p2: Point): number {
        return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
    }
}

// 单例实例
export const geometryAnalyzer = new GeometryAnalyzer();
