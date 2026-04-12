import React from 'react';
import { EdgeProps, BaseEdge, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';

/**
 * 架构图语义化连线类型定义
 * - sync: 同步调用（实线 + 实心箭头）
 * - async: 异步消息（虚线 + 实心箭头）
 * - dataflow: 数据流（粗线 + 双向标记可选）
 * - dependency: 松耦合依赖（点线 + 空心箭头）
 */
export type ArchEdgeSemantic = 'sync' | 'async' | 'dataflow' | 'dependency';

interface ArchEdgeData extends Record<string, unknown> {
    label?: string;
    semantic?: ArchEdgeSemantic;
}

const SEMANTIC_STYLES: Record<ArchEdgeSemantic, React.CSSProperties> = {
    sync:       { stroke: '#595959', strokeWidth: 2 },
    async:      { stroke: '#eb2f96', strokeWidth: 2, strokeDasharray: '8 4' },
    dataflow:   { stroke: '#1890ff', strokeWidth: 3 },
    dependency: { stroke: '#bfbfbf', strokeWidth: 1.5, strokeDasharray: '3 3' },
};

const SEMANTIC_LABELS: Record<ArchEdgeSemantic, string> = {
    sync: '同步',
    async: '异步',
    dataflow: '数据流',
    dependency: '依赖',
};

/**
 * 架构图专用语义边渲染组件
 * 根据 data.semantic 字段自动应用不同的视觉样式
 */
const ArchitectureEdge: React.FC<EdgeProps> = ({
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, style = {},
    markerEnd, data, selected,
}) => {
    const edgeData = (data || {}) as ArchEdgeData;
    const semantic = edgeData.semantic || 'sync';
    const semanticStyle = SEMANTIC_STYLES[semantic];

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX, sourceY, targetX, targetY,
        sourcePosition, targetPosition,
        borderRadius: 8,
    });

    const mergedStyle: React.CSSProperties = {
        ...semanticStyle,
        ...style,
        transition: 'stroke 0.2s, stroke-width 0.2s',
        ...(selected ? { stroke: '#1890ff', strokeWidth: (semanticStyle.strokeWidth as number || 2) + 1, filter: 'drop-shadow(0 0 3px rgba(24,144,255,0.4))' } : {}),
    };

    const label = edgeData.label || '';

    return (
        <>
            <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={mergedStyle} />
            {label && (
                <EdgeLabelRenderer>
                    <div style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: 'none',
                        fontSize: 11,
                        fontWeight: 500,
                        color: semanticStyle.stroke as string,
                        background: 'rgba(255,255,255,0.88)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: `1px solid ${semanticStyle.stroke}30`,
                        whiteSpace: 'nowrap',
                    }}>
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

export default React.memo(ArchitectureEdge);
export { SEMANTIC_STYLES, SEMANTIC_LABELS };
