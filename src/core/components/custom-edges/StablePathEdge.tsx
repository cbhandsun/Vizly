/**
 * StablePathEdge - 使用预计算路径点的稳定边渲染器
 * 
 * 解决问题：React Flow 的内置边类型会自动计算连线路径，可能在不同渲染中产生不同结果。
 * 
 * 解决方案：读取 edge.data.computedPath（我们的 A* 算法计算的路径点），直接渲染这些点，
 * 完全绕过 React Flow 的自动路径计算。
 */
import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { getSmartLabelPosition } from '../../algorithms/smartEdgeUtils';

interface Point {
    x: number;
    y: number;
}

/**
 * 将路径点数组转换为 SVG path 的 d 属性
 */
function pointsToPath(points: Point[]): string {
    if (!points || points.length < 2) return '';

    // 使用 M (移动到起点) 和 L (连线到后续点)
    const [start, ...rest] = points;
    const pathData = [`M ${start.x} ${start.y}`];

    for (const point of rest) {
        pathData.push(`L ${point.x} ${point.y}`);
    }

    return pathData.join(' ');
}

/**
 * 为正交路径添加圆角
 */
function pointsToRoundedPath(points: Point[], radius: number = 8): string {
    if (!points || points.length < 2) return '';
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    // [FIX] Snap near-orthogonal segments to perfect orthogonal BEFORE generating curves.
    // This prevents diagonal L/Q commands caused by fractional handle coordinate offsets (e.g. dx=12, dy=419).
    const snapped = points.map(p => ({ ...p }));
    for (let i = 0; i < snapped.length - 1; i++) {
        const a = snapped[i];
        const b = snapped[i + 1];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        // If one axis delta is much smaller than the other, snap it to zero
        if (dx > 0.5 && dy > 0.5) {
            if (dx < 15 && dy >= 15) {
                // Almost vertical — snap x
                b.x = a.x;
            } else if (dy < 15 && dx >= 15) {
                // Almost horizontal — snap y
                b.y = a.y;
            }
        }
    }

    const pathParts: string[] = [];
    pathParts.push(`M ${snapped[0].x} ${snapped[0].y}`);

    for (let i = 1; i < snapped.length - 1; i++) {
        const prev = snapped[i - 1];
        const curr = snapped[i];
        const next = snapped[i + 1];

        // 计算进入角和离开角的方向
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;

        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        // 限制圆角半径不超过线段长度的一半
        const r = Math.min(radius, len1 / 2, len2 / 2);

        if (r > 0 && len1 > 0 && len2 > 0) {
            // 圆角起点
            const startX = curr.x - (dx1 / len1) * r;
            const startY = curr.y - (dy1 / len1) * r;
            // 圆角终点
            const endX = curr.x + (dx2 / len2) * r;
            const endY = curr.y + (dy2 / len2) * r;

            pathParts.push(`L ${startX} ${startY}`);
            pathParts.push(`Q ${curr.x} ${curr.y} ${endX} ${endY}`);
        } else {
            pathParts.push(`L ${curr.x} ${curr.y}`);
        }
    }

    // 最后一个点
    const last = snapped[snapped.length - 1];
    pathParts.push(`L ${last.x} ${last.y}`);

    return pathParts.join(' ');
}

function isShortOrthogonalPath(points: Point[]): boolean {
    if (points.length > 4) return false;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1) {
            return false;
        }
    }
    return true;
}

/**
 * 稳定路径边组件
 */
export const StablePathEdge = memo<EdgeProps>((props) => {
    const {
        id,
        _source,
        _target,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        data,
        style,
        markerEnd,
        markerStart,
        label,
        labelStyle,
        _labelShowBg,
        _labelBgStyle,
        _labelBgPadding,
        _labelBgBorderRadius,
    } = props;

    // ReactFlow perf check: we are completely safe from global node movement here
    // 读取预计算的路径点
    const computedPath: Point[] | undefined = (data as any)?.computedPath;

    let edgePath: string;
    let labelX: number;
    let labelY: number;

    if (computedPath && computedPath.length >= 2) {
        // 使用预计算的路径点
        edgePath = isShortOrthogonalPath(computedPath)
            ? pointsToPath(computedPath)
            : pointsToRoundedPath(computedPath, 6);

        // 计算标签位置（路径中点）
        const pos = getSmartLabelPosition(computedPath);
        labelX = pos.x;
        labelY = pos.y;
    } else {
        // Fallback: 使用 React Flow 的 smoothstep 路径
        const [path, lx, ly] = getSmoothStepPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
            borderRadius: 8,
        });
        edgePath = path;
        labelX = lx;
        labelY = ly;
    }

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                style={style}
                markerEnd={markerEnd}
                markerStart={markerStart}
            />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        key={`${id}-label`}
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 10,
                            fontWeight: 500,
                            pointerEvents: 'all',
                            ...labelStyle,
                        }}
                        className="nodrag nopan"
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
});

StablePathEdge.displayName = 'StablePathEdge';

export default StablePathEdge;
