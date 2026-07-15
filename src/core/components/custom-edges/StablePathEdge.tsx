/**
 * StablePathEdge - 使用预计算路径点的稳定边渲染器
 * 
 * 解决问题：React Flow 的内置边类型会自动计算连线路径，可能在不同渲染中产生不同结果。
 * 
 * 解决方案：读取 edge.data.computedPath（我们的 A* 算法计算的路径点），直接渲染这些点，
 * 完全绕过 React Flow 的自动路径计算。
 */
import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps } from '@xyflow/react';
import { getSmartLabelPosition } from '../../algorithms/smartEdgeUtils';
import { getEdgeLabelAutoOffset } from './edgeLabelAvoidance';

interface Point {
    x: number;
    y: number;
}

/**
 * 将路径点数组转换为 SVG path 的 d 属性
 */
function snapNearOrthogonalPoints(points: Point[]): Point[] {
    const snapped = points.map(p => ({ ...p }));
    const microAxisSnap = 8;
    const minMajorAxisLength = 16;
    const maxMinorAxisRatio = 0.08;
    for (let i = 0; i < snapped.length - 1; i++) {
        const a = snapped[i];
        const b = snapped[i + 1];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dy >= minMajorAxisLength && dx <= microAxisSnap && dx <= dy * maxMinorAxisRatio) {
            b.x = a.x;
        } else if (dx >= minMajorAxisLength && dy <= microAxisSnap && dy <= dx * maxMinorAxisRatio) {
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

function fallbackOrthogonalPoints(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    sourcePosition: unknown,
): Point[] {
    const start = { x: sourceX, y: sourceY };
    const end = { x: targetX, y: targetY };
    if (Math.abs(sourceX - targetX) <= 1 || Math.abs(sourceY - targetY) <= 1) {
        return snapNearOrthogonalPoints([start, end]);
    }

    const sourceSide = String(sourcePosition ?? '').toLowerCase();
    const verticalFirst = sourceSide === 'top' || sourceSide === 'bottom';
    return snapNearOrthogonalPoints(verticalFirst
        ? [start, { x: sourceX, y: targetY }, end]
        : [start, { x: targetX, y: sourceY }, end]);
}

const autoLabelOffset = (
    ownPath: Point[],
    labelPoint: Point,
    labelText: string,
    peerPaths: Point[][],
): Point => {
    return getEdgeLabelAutoOffset(ownPath, labelPoint, labelText, peerPaths);
};

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
    const peerPaths = useStore((state: any) => (
        Array.isArray(state.edges)
            ? state.edges
                .filter((edge: any) => edge?.id !== id)
                .map((edge: any) => (edge?.data as any)?.computedPath)
                .filter((path: unknown): path is Point[] => (
                    Array.isArray(path)
                    && path.length >= 2
                    && path.every((point: any) => (
                        typeof point?.x === 'number'
                        && Number.isFinite(point.x)
                        && typeof point?.y === 'number'
                        && Number.isFinite(point.y)
                    ))
                ))
            : []
    ));

    // ReactFlow perf check: we are completely safe from global node movement here
    // 读取预计算的路径点
    const computedPath: Point[] | undefined = (data as any)?.computedPath;

    let edgePath: string;
    let labelX: number;
    let labelY: number;
    let renderPath: Point[] | undefined;

    if (computedPath && computedPath.length >= 2) {
        renderPath = snapNearOrthogonalPoints(computedPath);
        edgePath = pointsToPath(renderPath);

        // 计算标签位置（路径中点）
        const pos = getSmartLabelPosition(renderPath);
        labelX = pos.x;
        labelY = pos.y;
    } else {
        renderPath = fallbackOrthogonalPoints(sourceX, sourceY, targetX, targetY, sourcePosition);
        edgePath = pointsToPath(renderPath);
        const pos = getSmartLabelPosition(renderPath);
        labelX = pos.x;
        labelY = pos.y;
    }

    const dataLabelPosition = (data as any)?.labelPosition;
    if (
        dataLabelPosition
        && typeof dataLabelPosition.x === 'number'
        && Number.isFinite(dataLabelPosition.x)
        && typeof dataLabelPosition.y === 'number'
        && Number.isFinite(dataLabelPosition.y)
    ) {
        labelX = dataLabelPosition.x;
        labelY = dataLabelPosition.y;
    }

    const labelOffset = (data as any)?.labelOffset;
    const hasManualLabelPosition = !!labelOffset
        || typeof (data as any)?.absoluteLabelX === 'number'
        || typeof (data as any)?.absoluteLabelY === 'number';

    if (labelOffset) {
        labelX += Number(labelOffset.x) || 0;
        labelY += Number(labelOffset.y) || 0;
    }

    if (typeof (data as any)?.absoluteLabelX === 'number' && Number.isFinite((data as any).absoluteLabelX)) {
        labelX = (data as any).absoluteLabelX;
    }

    if (typeof (data as any)?.absoluteLabelY === 'number' && Number.isFinite((data as any).absoluteLabelY)) {
        labelY = (data as any).absoluteLabelY;
    }

    if (!hasManualLabelPosition && label && renderPath && renderPath.length >= 2) {
        const offset = autoLabelOffset(renderPath, { x: labelX, y: labelY }, String(label), peerPaths);
        labelX += offset.x;
        labelY += offset.y;
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
