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
import { createFilletedPath, getSmartLabelPosition } from '../../algorithms/smartEdgeUtils';

interface Point {
    x: number;
    y: number;
}

/**
 * 将路径点数组转换为 SVG path 的 d 属性
 */
function snapNearOrthogonalPoints(points: Point[]): Point[] {
    const snapped = points.map(p => ({ ...p }));
    const microAxisSnap = 1;
    for (let i = 0; i < snapped.length - 1; i++) {
        const a = snapped[i];
        const b = snapped[i + 1];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx <= microAxisSnap && dy > microAxisSnap) {
            b.x = a.x;
        } else if (dy <= microAxisSnap && dx > microAxisSnap) {
            b.y = a.y;
        }
    }
    return snapped;
}

function pointsToPath(points: Point[]): string {
    if (!points || points.length < 2) return '';

    const snapped = snapNearOrthogonalPoints(points);
    // 使用 M (移动到起点) 和 L (连线到后续点)
    const [start, ...rest] = snapped;
    const pathData = [`M ${start.x} ${start.y}`];

    for (const point of rest) {
        pathData.push(`L ${point.x} ${point.y}`);
    }

    return pathData.join(' ');
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
        const edgeConfig = (data as any)?.edgeConfig;
        const configuredRadius = Number(edgeConfig?.borderRadius ?? (data as any)?.borderRadius ?? 8);
        const renderRadius = Number.isFinite(configuredRadius)
            ? Math.max(0, Math.min(24, configuredRadius))
            : 8;
        edgePath = createFilletedPath(computedPath, renderRadius) || pointsToPath(computedPath);

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
