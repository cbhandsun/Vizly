/**
 * 智能端口选择算法
 * 
 * 功能:
 * - 根据源节点和目标节点的相对位置自动选择最优连接端口
 * - 支持四个方向的端口: top, right, bottom, left
 */

import { Position } from '@xyflow/react';

export interface Node {
    id: string;
    position: { x: number; y: number };
    measured?: { width?: number; height?: number };
    style?: { width?: number | string; height?: number | string };
}

/**
 * 获取节点的中心点
 */
function getNodeCenter(node: Node): { x: number; y: number } {
    const width = node.measured?.width ||
        (typeof node.style?.width === 'number' ? node.style.width : 150);
    const height = node.measured?.height ||
        (typeof node.style?.height === 'number' ? node.style.height : 80);

    return {
        x: node.position.x + width / 2,
        y: node.position.y + height / 2
    };
}

/**
 * 智能选择最优端口
 * 
 * @param sourceNode 源节点
 * @param targetNode 目标节点
 * @returns 源端口和目标端口
 */
export function selectOptimalPorts(
    sourceNode: Node,
    targetNode: Node
): { sourcePosition: Position; targetPosition: Position } {
    const sourceCenter = getNodeCenter(sourceNode);
    const targetCenter = getNodeCenter(targetNode);

    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    // 计算角度(弧度)
    const angle = Math.atan2(dy, dx);
    const angleDeg = (angle * 180) / Math.PI;

    // 根据角度选择端口
    // -45° 到 45°: 右侧
    // 45° 到 135°: 下方
    // 135° 到 -135°: 左侧
    // -135° 到 -45°: 上方

    let sourcePosition: Position;
    let targetPosition: Position;

    if (angleDeg >= -45 && angleDeg < 45) {
        // 目标在右侧
        sourcePosition = Position.Right;
        targetPosition = Position.Left;
    } else if (angleDeg >= 45 && angleDeg < 135) {
        // 目标在下方
        sourcePosition = Position.Bottom;
        targetPosition = Position.Top;
    } else if (angleDeg >= 135 || angleDeg < -135) {
        // 目标在左侧
        sourcePosition = Position.Left;
        targetPosition = Position.Right;
    } else {
        // 目标在上方
        sourcePosition = Position.Top;
        targetPosition = Position.Bottom;
    }

    return { sourcePosition, targetPosition };
}

/**
 * 根据端口位置获取端口坐标
 */
export function getPortPosition(
    node: Node,
    position: Position
): { x: number; y: number } {
    const width = node.measured?.width ||
        (typeof node.style?.width === 'number' ? node.style.width : 150);
    const height = node.measured?.height ||
        (typeof node.style?.height === 'number' ? node.style.height : 80);

    const { x, y } = node.position;

    switch (position) {
        case Position.Top:
            return { x: x + width / 2, y };
        case Position.Right:
            return { x: x + width, y: y + height / 2 };
        case Position.Bottom:
            return { x: x + width / 2, y: y + height };
        case Position.Left:
            return { x, y: y + height / 2 };
        default:
            return { x: x + width / 2, y: y + height / 2 };
    }
}
