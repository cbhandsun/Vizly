import React, { memo } from 'react';
import { NodeProps, Node } from '@xyflow/react';
import './MindMapBoundaryNode.css';

export interface MindMapBoundaryNodeData extends Record<string, unknown> {
    title?: string;
    styleType?: 'dashed' | 'solid' | 'fill';
    color?: string;
    width?: number;
    height?: number;
}

interface MindMapBoundaryNodeProps extends NodeProps<Node<MindMapBoundaryNodeData, 'mindmap-boundary'>> {
    id: string;
    data: MindMapBoundaryNodeData;
    selected: boolean;
}

const MindMapBoundaryNode = ({ data, selected }: MindMapBoundaryNodeProps) => {
    const title = data?.title;
    const styleType = data?.styleType || 'dashed';
    const color = data?.color || '#1890ff';
    const width = data?.width || 200;
    const height = data?.height || 100;

    const baseStyle = {
        width: `${width}px`,
        height: `${height}px`,
        borderColor: color,
        backgroundColor: styleType === 'fill' ? `${color}1A` : 'transparent', // 1A is ~10% opacity
        borderStyle: styleType === 'dashed' ? 'dashed' : (styleType === 'solid' ? 'solid' : 'none'),
        borderWidth: styleType !== 'fill' ? '2px' : '0',
        zIndex: -1,
        pointerEvents: 'none',
    } as React.CSSProperties;

    return (
        <div className={`mindmap-boundary-node ${selected ? 'selected' : ''}`} style={baseStyle}>
            {title && (
                <div className="mindmap-boundary-title" style={{ color: color }}>
                    {title}
                </div>
            )}
        </div>
    );
};

export default memo(MindMapBoundaryNode);
