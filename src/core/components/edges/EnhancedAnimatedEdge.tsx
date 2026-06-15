/**
 * 增强的 Edge 组件 - 演示版
 * 功能：集成同步回退路径 + Worker 精确计算 + 平滑过渡动画
 * 
 * 使用方式：
 * 1. 在 React Flow 的 edgeTypes 中注册此组件
 * 2. Worker 计算完成后通过 setEdges 更新路径
 */

import React, { useMemo } from 'react';
import { EdgeProps, getBezierPath } from '@xyflow/react';
import { useSpring, animated } from '@react-spring/web';
import {
    computeManhattanPath,
    parseHandleDirection,
    type Point
} from '../../algorithms/simpleFallbackPath';

/**
 * Convert an array of points to an SVG path command
 */
function svgPathFromPoints(points: Point[]): string {
    if (!points || points.length < 2) return '';
    return `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
}

/**
 * 演示：带回退和动画的自定义 Edge
 */
export function EnhancedAnimatedEdge({
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    markerEnd,
    style,
    data
}: EdgeProps) {
    const pathData = useMemo(() => {
        // [NEW] 优先使用 Worker/ELK 计算好的精确路径
        if (data?.elkPath && Array.isArray(data.elkPath)) {
            const points = data.elkPath as Point[];
            if (points.length >= 2) {
                return svgPathFromPoints(points);
            }
        }

        // 降级：如果只有 string 类型的 workerPath
        if (typeof data?.workerPath === 'string') {
            return data.workerPath;
        }

        // 再次降级：实时计算简单的曼哈顿路径
        const startPoint: Point = { x: sourceX, y: sourceY };
        const endPoint: Point = { x: targetX, y: targetY };

        const startDir = parseHandleDirection(sourcePosition);
        const endDir = parseHandleDirection(targetPosition);

        return computeManhattanPath(
            startPoint,
            endPoint,
            startDir,
            endDir
        );

    }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data?.elkPath, data?.workerPath]);
    const isComputing = false;

    // 使用 react-spring 实现路径平滑过渡
    const animatedProps = useSpring({
        d: pathData,
        strokeDasharray: isComputing ? '5 5' : '0 0',
        opacity: isComputing ? 0.6 : 1,
        config: {
            tension: 280,
            friction: 60
        }
    });

    return (
        <g>
            {/* 主路径：使用动画 */}
            <animated.path
                id={id}
                d={animatedProps.d}
                fill="none"
                stroke={style?.stroke || '#94a3b8'}
                strokeWidth={style?.strokeWidth || 2}
                strokeDasharray={animatedProps.strokeDasharray}
                opacity={animatedProps.opacity}
                markerEnd={markerEnd}
                style={{
                    transition: 'stroke 0.2s',
                    ...style
                }}
            />

            {/* 计算中指示器（可选）*/}
            {isComputing && (
                <text
                    x={(sourceX + targetX) / 2}
                    y={(sourceY + targetY) / 2}
                    fill="#999"
                    fontSize="10"
                    textAnchor="middle"
                >
                    ⏳
                </text>
            )}
        </g>
    );
}

/**
 * 简化版：仅使用 CSS 过渡的 Edge
 * 适合不需要复杂动画的场景
 */
export function SimpleAnimatedEdge(props: EdgeProps) {
    const [path] = getBezierPath({
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: props.targetX,
        targetY: props.targetY,
        targetPosition: props.targetPosition,
    });

    return (
        <path
            id={props.id}
            d={path}
            fill="none"
            stroke={props.style?.stroke || '#94a3b8'}
            strokeWidth={props.style?.strokeWidth || 2}
            markerEnd={props.markerEnd}
            className="diagram-edge-smooth"
            style={{
                transition: 'd 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                ...props.style
            }}
        />
    );
}

/**
 * 使用示例：
 * 
 * // 在 DiagramViewer 或其他组件中
 * import { EnhancedAnimatedEdge } from './EnhancedAnimatedEdge';
 * 
 * const edgeTypes = {
 *   animated: EnhancedAnimatedEdge,
 *   simple: SimpleAnimatedEdge,
 *   default: SimpleAnimatedEdge
 * };
 * 
 * <ReactFlow
 *   nodes={nodes}
 *   edges={edges}
 *   edgeTypes={edgeTypes}
 * />
 */
