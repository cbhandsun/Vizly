import { useCallback, useState, useRef } from 'react';
import { Node } from '@xyflow/react';

export interface SmartGuide {
    type: 'horizontal' | 'vertical' | 'spacing';
    position: number;
    /** 参考线有效范围（scoped-length）*/
    extent?: { start: number; end: number };
    gap?: number;
    gapStart?: number;
    gapEnd?: number;
    anchorNodeId?: string;
    /** spacing 类型专用：两段等间距的起止 */
    spacingSegments?: Array<{ start: number; end: number; gap: number }>;
}

/** 吸附计算结果：需要将节点位移的 delta */
export interface SnapDelta {
    x: number;
    y: number;
}

interface UseSmartGuidesProps {
    threshold?: number;
}

/** 获取节点的 bounding box */
function getNodeBounds(node: Node) {
    const w = node.measured?.width || node.width || 0;
    const h = node.measured?.height || node.height || 0;
    return {
        left: node.position.x,
        right: node.position.x + w,
        top: node.position.y,
        bottom: node.position.y + h,
        centerX: node.position.x + w / 2,
        centerY: node.position.y + h / 2,
        w, h
    };
}

/**
 * 核心对齐检测逻辑（纯函数，无副作用）。
 * 同时计算 guides（视觉参考线）、snapDelta（磁性吸附位移）和 等距分布吸附。
 */
function computeAlignment(node: Node, allNodes: Node[], threshold: number) {
    const newGuides: SmartGuide[] = [];
    let snapX = 0;
    let snapY = 0;

    const nb = getNodeBounds(node);

    let snappedH = false;
    let snappedV = false;

    let checks = 0;
    const maxChecks = allNodes.length > 400 ? 120 : allNodes.length > 220 ? 200 : Number.POSITIVE_INFINITY;
    const proximity = allNodes.length > 300 ? 520 : 720;

    // ===== 1. 位置对齐吸附 =====
    for (const other of allNodes) {
        if (other.id === node.id || other.hidden) continue;
        if (other.parentId !== node.parentId) continue;
        if (checks++ >= maxChecks) break;

        const ob = getNodeBounds(other);

        if (Math.abs(ob.centerX - nb.centerX) > proximity && Math.abs(ob.centerY - nb.centerY) > proximity) {
            continue;
        }

        // Vertical Alignment (X-axis)
        if (!snappedV) {
            const candidates: { dist: number; guidePos: number; delta: number; ob: typeof ob }[] = [];
            const pairs: [number, number][] = [
                [nb.left, ob.left], [nb.left, ob.right], [nb.left, ob.centerX],
                [nb.right, ob.left], [nb.right, ob.right], [nb.right, ob.centerX],
                [nb.centerX, ob.left], [nb.centerX, ob.right], [nb.centerX, ob.centerX],
            ];
            for (const [nVal, oVal] of pairs) {
                const dist = Math.abs(nVal - oVal);
                if (dist < threshold) {
                    candidates.push({ dist, guidePos: oVal, delta: oVal - nVal, ob });
                }
            }

            if (candidates.length > 0) {
                const best = candidates.reduce((a, b) => a.dist < b.dist ? a : b);
                snapX = best.delta;

                // Scoped extent：垂直线在 Y 方向上的范围
                const allTops = [nb.top + best.delta, best.ob.top]; // 吸附后的 top
                const allBottoms = [nb.bottom + best.delta, best.ob.bottom];
                const extentStart = Math.min(...allTops) - 20;
                const extentEnd = Math.max(...allBottoms) + 20;

                const gap = (nb.bottom < ob.top) ? (ob.top - nb.bottom) : (ob.bottom < nb.top) ? (nb.top - ob.bottom) : undefined;
                newGuides.push({
                    type: 'vertical',
                    position: best.guidePos,
                    extent: { start: extentStart, end: extentEnd },
                    anchorNodeId: other.id,
                    gap: gap ? Math.round(gap) : undefined,
                    gapStart: gap ? (nb.bottom < ob.top ? nb.bottom : ob.bottom) : undefined,
                    gapEnd: gap ? (nb.bottom < ob.top ? ob.top : nb.top) : undefined
                });
                snappedV = true;
            }
        }

        // Horizontal Alignment (Y-axis)
        if (!snappedH) {
            const candidates: { dist: number; guidePos: number; delta: number; ob: typeof ob }[] = [];
            const pairs: [number, number][] = [
                [nb.top, ob.top], [nb.top, ob.bottom], [nb.top, ob.centerY],
                [nb.bottom, ob.top], [nb.bottom, ob.bottom], [nb.bottom, ob.centerY],
                [nb.centerY, ob.top], [nb.centerY, ob.bottom], [nb.centerY, ob.centerY],
            ];
            for (const [nVal, oVal] of pairs) {
                const dist = Math.abs(nVal - oVal);
                if (dist < threshold) {
                    candidates.push({ dist, guidePos: oVal, delta: oVal - nVal, ob });
                }
            }

            if (candidates.length > 0) {
                const best = candidates.reduce((a, b) => a.dist < b.dist ? a : b);
                snapY = best.delta;

                // Scoped extent：水平线在 X 方向上的范围
                const allLefts = [nb.left + best.delta, best.ob.left];
                const allRights = [nb.right + best.delta, best.ob.right];
                const extentStart = Math.min(...allLefts) - 20;
                const extentEnd = Math.max(...allRights) + 20;

                const gap = (nb.right < ob.left) ? (ob.left - nb.right) : (ob.right < nb.left) ? (nb.left - ob.right) : undefined;
                newGuides.push({
                    type: 'horizontal',
                    position: best.guidePos,
                    extent: { start: extentStart, end: extentEnd },
                    anchorNodeId: other.id,
                    gap: gap ? Math.round(gap) : undefined,
                    gapStart: gap ? (nb.right < ob.left ? nb.right : ob.right) : undefined,
                    gapEnd: gap ? (nb.right < ob.left ? ob.left : nb.left) : undefined
                });
                snappedH = true;
            }
        }

        if (snappedH && snappedV) break;
    }

    // ===== 2. 等距分布吸附 =====
    // 在 X 和 Y 方向分别检测等距排列
    const siblings = allNodes.filter(n => n.id !== node.id && !n.hidden && n.parentId === node.parentId);

    // X 方向等距：找左右最近邻居
    if (!snappedV && siblings.length >= 2) {
        const adjustedCenterX = nb.centerX + snapX;
        // 找在当前节点左边和右边最近的节点
        let leftNeighbor: ReturnType<typeof getNodeBounds> | null = null;
        let rightNeighbor: ReturnType<typeof getNodeBounds> | null = null;
        let leftDist = Infinity, rightDist = Infinity;

        for (const s of siblings) {
            const sb = getNodeBounds(s);
            if (sb.right < adjustedCenterX && adjustedCenterX - sb.right < leftDist) {
                leftDist = adjustedCenterX - sb.right;
                leftNeighbor = sb;
            }
            if (sb.left > adjustedCenterX && sb.left - adjustedCenterX < rightDist) {
                rightDist = sb.left - adjustedCenterX;
                rightNeighbor = sb;
            }
        }

        if (leftNeighbor && rightNeighbor) {
            // 当前节点左边距 = 当前左边缘 - 左邻居右边缘
            const gapLeft = (nb.left + snapX) - leftNeighbor.right;
            const gapRight = rightNeighbor.left - (nb.right + snapX);
            const avgGap = (gapLeft + gapRight) / 2;
            const diff = Math.abs(gapLeft - gapRight);

            if (diff < threshold && diff > 0.5) {
                // 吸附到等距中点
                const snapToX = avgGap - gapLeft; // 需要向右移动的量
                snapX += snapToX;

                newGuides.push({
                    type: 'spacing',
                    position: nb.centerY, // 渲染在节点中心高度
                    spacingSegments: [
                        { start: leftNeighbor.right, end: nb.left + snapX, gap: Math.round(avgGap) },
                        { start: nb.right + snapX, end: rightNeighbor.left, gap: Math.round(avgGap) },
                    ]
                });
            }
        }
    }

    // Y 方向等距
    if (!snappedH && siblings.length >= 2) {
        const adjustedCenterY = nb.centerY + snapY;
        let topNeighbor: ReturnType<typeof getNodeBounds> | null = null;
        let bottomNeighbor: ReturnType<typeof getNodeBounds> | null = null;
        let topDist = Infinity, bottomDist = Infinity;

        for (const s of siblings) {
            const sb = getNodeBounds(s);
            if (sb.bottom < adjustedCenterY && adjustedCenterY - sb.bottom < topDist) {
                topDist = adjustedCenterY - sb.bottom;
                topNeighbor = sb;
            }
            if (sb.top > adjustedCenterY && sb.top - adjustedCenterY < bottomDist) {
                bottomDist = sb.top - adjustedCenterY;
                bottomNeighbor = sb;
            }
        }

        if (topNeighbor && bottomNeighbor) {
            const gapTop = (nb.top + snapY) - topNeighbor.bottom;
            const gapBottom = bottomNeighbor.top - (nb.bottom + snapY);
            const avgGap = (gapTop + gapBottom) / 2;
            const diff = Math.abs(gapTop - gapBottom);

            if (diff < threshold && diff > 0.5) {
                const snapToY = avgGap - gapTop;
                snapY += snapToY;

                newGuides.push({
                    type: 'spacing',
                    position: nb.centerX, // 渲染在节点中心宽度
                    spacingSegments: [
                        { start: topNeighbor.bottom, end: nb.top + snapY, gap: Math.round(avgGap) },
                        { start: nb.bottom + snapY, end: bottomNeighbor.top, gap: Math.round(avgGap) },
                    ]
                });
            }
        }
    }

    const snapDelta: SnapDelta | null = (snapX !== 0 || snapY !== 0) ? { x: snapX, y: snapY } : null;
    return { guides: newGuides, snapDelta };
}

export const useSmartGuides = ({ threshold = 5 }: UseSmartGuidesProps = {}) => {
    const [guides, setGuides] = useState<SmartGuide[]>([]);
    const lastSigRef = useRef('');
    const snapDeltaRef = useRef<SnapDelta | null>(null);

    const onSmartNodeDrag = useCallback(
        (_e: React.MouseEvent, node: Node, nodes: Node[]): SnapDelta | null => {
            const result = computeAlignment(node, nodes, threshold);

            snapDeltaRef.current = result.snapDelta;

            const sig = result.guides.map(g =>
                `${g.type}:${g.position}:${g.anchorNodeId || ''}:${g.extent?.start ?? ''}:${g.extent?.end ?? ''}:${g.gap ?? ''}:${g.spacingSegments?.map(s => `${s.start}-${s.end}`).join(',') ?? ''}`
            ).join('|');
            if (sig !== lastSigRef.current) {
                lastSigRef.current = sig;
                setGuides(result.guides);
            }

            return result.snapDelta;
        },
        [threshold]
    );

    const clearGuides = useCallback(() => {
        lastSigRef.current = '';
        snapDeltaRef.current = null;
        setGuides([]);
    }, []);

    return { guides, onSmartNodeDrag, clearGuides, snapDeltaRef };
};
