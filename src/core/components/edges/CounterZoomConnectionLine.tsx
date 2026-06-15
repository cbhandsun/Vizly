/**
 * CounterZoomConnectionLine — 修正 CSS zoom 导致的连线终点偏移
 *
 * 问题：FlowchartDesigner 设置了 disableZoomCompensation=true，
 * 导致 .react-flow 继承了 ant-layout 的 zoom: 0.85。
 * ReactFlow 内部计算连线终点时使用：
 *   toX = (mouseClientX - bcr.left - vp.x) / vp.zoom
 * 但正确公式应为：
 *   toX = ((mouseClientX - bcr.left) / uiScale - vp.x) / vp.zoom
 *
 * 本组件接收 ReactFlow 算出的错误 toX/toY，逆向推导并补偿 uiScale。
 */
import React from 'react';
import { ConnectionLineComponentProps, getSmoothStepPath } from '@xyflow/react';
import { getUiScale } from '../shared/viewportStore';
import { readDomViewport } from '../../utils/domViewport';

export function CounterZoomConnectionLine({
    fromX, fromY, toX, toY,
    fromPosition, toPosition,
    connectionLineStyle,
}: ConnectionLineComponentProps) {
    const uiScale = getUiScale();

    let correctedToX = toX;
    let correctedToY = toY;

    if (uiScale !== 1) {
        const vp = readDomViewport();
        // 逆向：physDist = toX_wrong * vp.zoom + vp.x
        const physDistX = toX * vp.zoom + vp.x;
        const physDistY = toY * vp.zoom + vp.y;
        // 补偿：logicalDist = physDist / uiScale
        // 正确：toX = (logicalDist - vp.x) / vp.zoom
        correctedToX = (physDistX / uiScale - vp.x) / vp.zoom;
        correctedToY = (physDistY / uiScale - vp.y) / vp.zoom;
    }

    const [path] = getSmoothStepPath({
        sourceX: fromX,
        sourceY: fromY,
        sourcePosition: fromPosition,
        targetX: correctedToX,
        targetY: correctedToY,
        targetPosition: toPosition,
        borderRadius: 8,
    });

    return (
        <g>
            <path
                d={path}
                fill="none"
                strokeWidth={2.5}
                className="animated"
                style={{
                    ...connectionLineStyle,
                    stroke: connectionLineStyle?.stroke || 'rgba(59, 130, 246, 0.95)',
                }}
            />
        </g>
    );
}

export default React.memo(CounterZoomConnectionLine);
