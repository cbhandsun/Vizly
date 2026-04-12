/**
 * Label-Aware Routing - 标签感知路由
 * 
 * 将节点标签作为障碍物纳入路由计算，避免边穿过标签文字。
 * 
 * 这是行业最佳实践（yWorks等工具的核心功能），可显著提升图表可读性。
 */

import { Rectangle, Point } from './pathfinding';

export interface NodeLabelInfo {
    nodeId: string;
    text: string;
    position: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'inside';
    width: number;
    height: number;
    offsetX?: number;
    offsetY?: number;
}

export interface LabelAwareConfig {
    /** 是否启用标签感知 */
    enabled: boolean;
    /** 标签周围的额外padding */
    labelPadding: number;
    /** 默认标签尺寸估算 */
    defaultLabelWidth: number;
    defaultLabelHeight: number;
    /** 每字符宽度估算（用于动态计算） */
    charWidth: number;
    charHeight: number;
}

export const DEFAULT_LABEL_CONFIG: LabelAwareConfig = {
    enabled: true,
    labelPadding: 5,
    defaultLabelWidth: 60,
    defaultLabelHeight: 20,
    charWidth: 8,
    charHeight: 16,
};

/**
 * 估算标签尺寸
 */
export function estimateLabelSize(
    text: string | undefined,
    config: LabelAwareConfig = DEFAULT_LABEL_CONFIG
): { width: number; height: number } {
    if (!text) {
        return { width: 0, height: 0 };
    }

    // 按行分割
    const lines = text.split('\n');
    const maxLineLength = Math.max(...lines.map(line => line.length));

    const width = Math.max(config.defaultLabelWidth, maxLineLength * config.charWidth);
    const height = Math.max(config.defaultLabelHeight, lines.length * config.charHeight);

    return { width, height };
}

/**
 * 计算标签的绝对位置边界框
 */
export function calculateLabelBounds(
    nodeX: number,
    nodeY: number,
    nodeWidth: number,
    nodeHeight: number,
    labelWidth: number,
    labelHeight: number,
    labelPosition: NodeLabelInfo['position'] = 'center',
    offsetX: number = 0,
    offsetY: number = 0,
    padding: number = 5
): Rectangle | null {
    if (labelWidth <= 0 || labelHeight <= 0) {
        return null;
    }

    let x: number, y: number;

    switch (labelPosition) {
        case 'top':
            x = nodeX + (nodeWidth - labelWidth) / 2 + offsetX;
            y = nodeY - labelHeight - padding + offsetY;
            break;
        case 'bottom':
            x = nodeX + (nodeWidth - labelWidth) / 2 + offsetX;
            y = nodeY + nodeHeight + padding + offsetY;
            break;
        case 'left':
            x = nodeX - labelWidth - padding + offsetX;
            y = nodeY + (nodeHeight - labelHeight) / 2 + offsetY;
            break;
        case 'right':
            x = nodeX + nodeWidth + padding + offsetX;
            y = nodeY + (nodeHeight - labelHeight) / 2 + offsetY;
            break;
        case 'center':
        case 'inside':
        default:
            // 中心标签在节点内部，通常不作为独立障碍物
            // 因为边不应该穿过节点本身
            return null;
    }

    return {
        x: x - padding,
        y: y - padding,
        width: labelWidth + padding * 2,
        height: labelHeight + padding * 2,
    };
}

/**
 * 从节点列表提取标签障碍物
 */
export function extractLabelObstacles(
    nodes: Array<{
        id: string;
        position?: { x: number; y: number };
        positionAbsolute?: { x: number; y: number };
        measured?: { width?: number; height?: number };
        width?: number;
        height?: number;
        data?: {
            label?: string;
            labelPosition?: NodeLabelInfo['position'];
        };
    }>,
    config: LabelAwareConfig = DEFAULT_LABEL_CONFIG
): Rectangle[] {
    if (!config.enabled) {
        return [];
    }

    const obstacles: Rectangle[] = [];

    for (const node of nodes) {
        const label = node.data?.label;
        if (!label) continue;

        const pos = node.positionAbsolute || node.position || { x: 0, y: 0 };
        const width = node.measured?.width || node.width || 150;
        const height = node.measured?.height || node.height || 80;
        const labelPosition = node.data?.labelPosition || 'bottom';

        // 估算标签尺寸
        const labelSize = estimateLabelSize(label, config);

        // 计算标签边界
        const labelBounds = calculateLabelBounds(
            pos.x,
            pos.y,
            width,
            height,
            labelSize.width,
            labelSize.height,
            labelPosition,
            0,
            0,
            config.labelPadding
        );

        if (labelBounds) {
            obstacles.push(labelBounds);
        }
    }

    return obstacles;
}

/**
 * 合并节点障碍物和标签障碍物
 */
export function getObstaclesWithLabels(
    nodeObstacles: Rectangle[],
    nodes: Array<{
        id: string;
        position?: { x: number; y: number };
        positionAbsolute?: { x: number; y: number };
        measured?: { width?: number; height?: number };
        width?: number;
        height?: number;
        data?: {
            label?: string;
            labelPosition?: NodeLabelInfo['position'];
        };
    }>,
    config: LabelAwareConfig = DEFAULT_LABEL_CONFIG
): Rectangle[] {
    const labelObstacles = extractLabelObstacles(nodes, config);
    return [...nodeObstacles, ...labelObstacles];
}

/**
 * 检查路径是否穿过任何标签
 */
export function isPathCrossingLabels(
    path: Point[],
    labelObstacles: Rectangle[],
    padding: number = 2
): boolean {
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];

        // 计算线段的边界框
        const segMinX = Math.min(p1.x, p2.x) - padding;
        const segMaxX = Math.max(p1.x, p2.x) + padding;
        const segMinY = Math.min(p1.y, p2.y) - padding;
        const segMaxY = Math.max(p1.y, p2.y) + padding;

        for (const label of labelObstacles) {
            // AABB 碰撞检测
            if (
                segMaxX >= label.x &&
                segMinX <= label.x + label.width &&
                segMaxY >= label.y &&
                segMinY <= label.y + label.height
            ) {
                return true;
            }
        }
    }

    return false;
}

export default {
    estimateLabelSize,
    calculateLabelBounds,
    extractLabelObstacles,
    getObstaclesWithLabels,
    isPathCrossingLabels,
    DEFAULT_LABEL_CONFIG,
};
