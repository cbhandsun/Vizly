/**
 * Worker-Compatible Enhanced Port Selection
 * 
 * 为 Web Worker 提供的端口选择适配层。
 * 由于 Worker 无法直接导入复杂模块，此文件提供简化的纯函数实现。
 */

import { Position } from '../types/flow';
import { analyzeGeometry } from './geometry-classifier';
import type { SpatialIndex } from './SpatialIndex';

export interface SimpleNodeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
}

/**
 * 快速端口选择（无需完整障碍物检测）
 * 基于几何位置和方向偏好选择最优端口
 * 
 * [ENHANCED] 智能端口分布：考虑端口使用情况，避免重叠
 */
export function selectPortsForWorker(
    sourceNode: SimpleNodeRect,
    targetNode: SimpleNodeRect,
    layoutDirection?: 'LR' | 'RL' | 'TB' | 'BT',
    obstacles?: Rectangle[] | SpatialIndex,
    portUsage?: { source?: Record<string, number>, target?: Record<string, number> } // [NEW]
): { sourcePos: Position; targetPos: Position; confidence: number } {
    const sCenterX = sourceNode.x + sourceNode.width / 2;
    const sCenterY = sourceNode.y + sourceNode.height / 2;
    const tCenterX = targetNode.x + targetNode.width / 2;
    const tCenterY = targetNode.y + targetNode.height / 2;

    const dx = tCenterX - sCenterX;
    const dy = tCenterY - sCenterY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    const geometry = analyzeGeometry(dx, dy, {
        sourceSize: { width: sourceNode.width, height: sourceNode.height },
        targetSize: { width: targetNode.width, height: targetNode.height }
    });
    const fallbackDir = String(layoutDirection || '').toUpperCase();
    const fallbackIsValid = fallbackDir === 'LR' || fallbackDir === 'RL' || fallbackDir === 'TB' || fallbackDir === 'BT';
    let effectiveLayoutDirection: 'LR' | 'RL' | 'TB' | 'BT';
    if (geometry === 'horizontal-forward') effectiveLayoutDirection = 'LR';
    else if (geometry === 'horizontal-reverse') effectiveLayoutDirection = 'RL';
    else if (geometry === 'vertical-forward') effectiveLayoutDirection = 'TB';
    else if (geometry === 'vertical-reverse') effectiveLayoutDirection = 'BT';
    else if (geometry === 'collocated') effectiveLayoutDirection = fallbackIsValid ? (fallbackDir as 'LR' | 'RL' | 'TB' | 'BT') : 'LR';
    else if (absDx >= absDy) effectiveLayoutDirection = dx >= 0 ? 'LR' : 'RL';
    else effectiveLayoutDirection = dy >= 0 ? 'TB' : 'BT';
    layoutDirection = effectiveLayoutDirection;

    let sourcePos: Position;
    let targetPos: Position;

    // 基于布局方向的默认端口
    switch (layoutDirection) {
        case 'LR':
            sourcePos = Position.Right;
            targetPos = Position.Left;
            break;
        case 'RL':
            sourcePos = Position.Left;
            targetPos = Position.Right;
            break;
        case 'TB':
            sourcePos = Position.Bottom;
            targetPos = Position.Top;
            break;
        case 'BT':
            sourcePos = Position.Top;
            targetPos = Position.Bottom;
            break;
    }

    // 智能调整：如果目标在"错误"方向，选择更合适的端口
    const isHorizontalLayout = layoutDirection === 'LR' || layoutDirection === 'RL';
    const isForwardLayout = layoutDirection === 'LR' || layoutDirection === 'TB';

    if (isHorizontalLayout) {
        // 水平布局
        if (isForwardLayout && dx < -50) {
            // 目标在左边（反向）
            sourcePos = Position.Left;
            targetPos = Position.Right;
        } else if (!isForwardLayout && dx > 50) {
            // RL布局但目标在右边
            sourcePos = Position.Right;
            targetPos = Position.Left;
        }

        // Y 差距明显大于 X 时，考虑使用垂直端口
        // [OPTIMIZATION] Increase threshold from 2 to 4 to prevent "flapping" in horizontal layouts
        if (absDy > absDx * 4 && absDy > 100) {
            if (dy > 0) {
                sourcePos = Position.Bottom;
                targetPos = Position.Top;
            } else {
                sourcePos = Position.Top;
                targetPos = Position.Bottom;
            }
        }
    } else {
        // 垂直布局
        if (isForwardLayout && dy < -50) {
            sourcePos = Position.Top;
            targetPos = Position.Bottom;
        } else if (!isForwardLayout && dy > 50) {
            sourcePos = Position.Bottom;
            targetPos = Position.Top;
        }

        // X 差距明显大于 Y 时，考虑使用水平端口
        // Threshold: 1.5x (was 4x) — a notably wider-than-tall displacement should use left/right ports.
        // The old 4x threshold caused edges with mixed horizontal+vertical displacement to stay on
        // top/bottom ports, then get overridden by obstacle detection to right/right (causing loops).
        if (absDx > absDy * 1.5 && absDx > 80) {
            if (dx > 0) {
                sourcePos = Position.Right;
                targetPos = Position.Left;
            } else {
                sourcePos = Position.Left;
                targetPos = Position.Right;
            }
        }
    }

    // 障碍物检测（如果提供）
    let confidence = 0.8;

    // [INDUSTRY STANDARD] Immediate Exit Clearance Check
    // BEFORE choosing the optimal geometric port, we must ensure it can "breathe".
    // If a port is blocked within 20px, it is a bad port, regardless of how close it is to target.
    
    const isSpatialIndex = (obs: unknown): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

    if (obstacles && (Array.isArray(obstacles) ? obstacles.length > 0 : true)) {
        const checkClearance = (pos: Position, node: SimpleNodeRect): boolean => {
            const portPt = getPortPoint(node, pos);
            // Probe 20px out
            let probeEnd: Point;
            switch (pos) {
                case Position.Top: probeEnd = { x: portPt.x, y: portPt.y - 20 }; break;
                case Position.Bottom: probeEnd = { x: portPt.x, y: portPt.y + 20 }; break;
                case Position.Left: probeEnd = { x: portPt.x - 20, y: portPt.y }; break;
                case Position.Right: probeEnd = { x: portPt.x + 20, y: portPt.y }; break;
            }

            if (isSpatialIndex(obstacles)) {
                // Use SpatialIndex
                const candidates = obstacles.query({
                    x: Math.min(portPt.x, probeEnd.x),
                    y: Math.min(portPt.y, probeEnd.y),
                    width: Math.abs(portPt.x - probeEnd.x) || 1, // Ensure non-zero for query
                    height: Math.abs(portPt.y - probeEnd.y) || 1
                });
                return !candidates.some(obs => lineIntersectsRect(portPt, probeEnd, obs));
            } else {
                // Use linear scan
                return !obstacles.some(obs => lineIntersectsRect(portPt, probeEnd, obs));
            }
        };

        const sourceClear = checkClearance(sourcePos, sourceNode);
        const targetClear = checkClearance(targetPos, targetNode);

        if (!sourceClear || !targetClear) {
            // Downgrade confidence massive
            confidence = 0.4;

            // Try to find a better pair
            // We iterate all 4 sides for source, find one that is clear and closest to target
            const candidates = [Position.Top, Position.Right, Position.Bottom, Position.Left];

            let bestSource = sourcePos;
            let bestSourceDist = Infinity;
            let foundBetterSource = false;

            if (!sourceClear) {
                for (const p of candidates) {
                    if (checkClearance(p, sourceNode)) {
                        const pt = getPortPoint(sourceNode, p);
                        const d = Math.abs(pt.x - tCenterX) + Math.abs(pt.y - tCenterY); // Manhattan
                        if (d < bestSourceDist) {
                            bestSourceDist = d;
                            bestSource = p;
                            foundBetterSource = true;
                        }
                    }
                }
                if (foundBetterSource) sourcePos = bestSource;
            }

            // Same for target
            let bestTarget = targetPos;
            let bestTargetDist = Infinity;
            let foundBetterTarget = false;

            if (!targetClear) {
                for (const p of candidates) {
                    if (checkClearance(p, targetNode)) {
                        const pt = getPortPoint(targetNode, p);
                        const d = Math.abs(pt.x - sCenterX) + Math.abs(pt.y - sCenterY);
                        if (d < bestTargetDist) {
                            bestTargetDist = d;
                            bestTarget = p;
                            foundBetterTarget = true;
                        }
                    }
                }
                if (foundBetterTarget) targetPos = bestTarget;
            }

            if (foundBetterSource || foundBetterTarget) {
                confidence = 0.7; // Recovered confidence
            }
        }

        // Original Path Block Check (Secondary check for the whole path)
        if (confidence > 0.6) {
            const sourcePort = getPortPoint(sourceNode, sourcePos);
            const targetPort = getPortPoint(targetNode, targetPos);

            const isBlocked = isSpatialIndex(obstacles)
                ? (() => {
                const candidates = obstacles.query({
                    x: Math.min(sourcePort.x, targetPort.x),
                    y: Math.min(sourcePort.y, targetPort.y),
                    width: Math.abs(sourcePort.x - targetPort.x),
                    height: Math.abs(sourcePort.y - targetPort.y)
                });
                return candidates.some(obs => lineIntersectsRect(sourcePort, targetPort, obs));
                })()
                : obstacles.some(obs => lineIntersectsRect(sourcePort, targetPort, obs));

            if (isBlocked) confidence = 0.6;
        }
    }

    // [NEW] Apply port usage awareness
    if (portUsage) {
        const result = applyPortUsageAwareness(sourcePos, targetPos, confidence, portUsage);
        return result;
    }

    return { sourcePos, targetPos, confidence };
}

/**
 * [NEW] Apply port usage awareness to avoid overused ports
 */
function applyPortUsageAwareness(
    sourcePos: Position,
    targetPos: Position,
    confidence: number,
    portUsage: { source?: Record<string, number>, target?: Record<string, number> }
): { sourcePos: Position; targetPos: Position; confidence: number } {
    const USAGE_THRESHOLD = 2; // 超过2条边时降低信心度

    // Map Position enum to direction string
    const posToDir = (pos: Position): string => {
        switch (pos) {
            case Position.Top: return 'top';
            case Position.Bottom: return 'bottom';
            case Position.Left: return 'left';
            case Position.Right: return 'right';
        }
    };

    const sourceUsage = portUsage.source?.[posToDir(sourcePos)] || 0;
    const targetUsage = portUsage.target?.[posToDir(targetPos)] || 0;

    // Degrade confidence if ports are overused
    if (sourceUsage > USAGE_THRESHOLD || targetUsage > USAGE_THRESHOLD) {
        confidence *= 0.5; // Halve confidence for overused ports

        // Try to find alternative ports if heavily overused
        if (sourceUsage > 3 || targetUsage > 3) {
            const candidates = [Position.Top, Position.Right, Position.Bottom, Position.Left];

            // Find least used source port
            if (sourceUsage > 3) {
                let minUsage = sourceUsage;
                let bestAlt = sourcePos;

                for (const alt of candidates) {
                    const altUsage = portUsage.source?.[posToDir(alt)] || 0;
                    if (altUsage < minUsage) {
                        minUsage = altUsage;
                        bestAlt = alt;
                    }
                }

                if (bestAlt !== sourcePos) {
                    sourcePos = bestAlt;
                    confidence = 0.6; // Partial recovery
                }
            }

            // Find least used target port
            if (targetUsage > 3) {
                let minUsage = targetUsage;
                let bestAlt = targetPos;

                for (const alt of candidates) {
                    const altUsage = portUsage.target?.[posToDir(alt)] || 0;
                    if (altUsage < minUsage) {
                        minUsage = altUsage;
                        bestAlt = alt;
                    }
                }

                if (bestAlt !== targetPos) {
                    targetPos = bestAlt;
                    confidence = 0.6; // Partial recovery
                }
            }
        }
    }

    return { sourcePos, targetPos, confidence };
}

function getPortPoint(node: SimpleNodeRect, pos: Position): Point {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;

    switch (pos) {
        case Position.Top:
            return { x: cx, y: node.y };
        case Position.Bottom:
            return { x: cx, y: node.y + node.height };
        case Position.Left:
            return { x: node.x, y: cy };
        case Position.Right:
            return { x: node.x + node.width, y: cy };
    }
}

function lineIntersectsRect(p1: Point, p2: Point, rect: Rectangle): boolean {
    const minX = rect.x;
    const maxX = rect.x + rect.width;
    const minY = rect.y;
    const maxY = rect.y + rect.height;

    // Check if both points are on the same side of the rect
    if ((p1.x < minX && p2.x < minX) || (p1.x > maxX && p2.x > maxX) ||
        (p1.y < minY && p2.y < minY) || (p1.y > maxY && p2.y > maxY)) {
        return false;
    }

    // For orthogonal lines (common in our case), simpler check
    if (Math.abs(p1.x - p2.x) < 0.1) { // Vertical line
        const x = p1.x;
        const yStart = Math.min(p1.y, p2.y);
        const yEnd = Math.max(p1.y, p2.y);
        return x >= minX && x <= maxX && !(yEnd < minY || yStart > maxY);
    }
    if (Math.abs(p1.y - p2.y) < 0.1) { // Horizontal line
        const y = p1.y;
        const xStart = Math.min(p1.x, p2.x);
        const xEnd = Math.max(p1.x, p2.x);
        return y >= minY && y <= maxY && !(xEnd < minX || xStart > maxX);
    }

    // Diagonal line fallback (Simple but covers centers if needed)
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    return midX >= minX && midX <= maxX && midY >= minY && midY <= maxY;
}

export default selectPortsForWorker;
