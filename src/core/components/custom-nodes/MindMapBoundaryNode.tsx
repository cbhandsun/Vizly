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
        borderColor: `${color}80`, // Half opacity
        backgroundColor: styleType === 'fill' ? `${color}15` : 'transparent',
        borderStyle: styleType === 'dashed' ? 'dashed' : 'solid',
        borderWidth: styleType === 'fill' ? '1px' : '2px',
        zIndex: -1,
        pointerEvents: 'none',
        backdropFilter: styleType === 'fill' ? 'blur(4px)' : 'none',
    } as React.CSSProperties;

    return (
        <div className={`mindmap-boundary-node type-${styleType} ${selected ? 'selected' : ''}`} style={baseStyle}>
            {title && (
                <div 
                    className="mindmap-boundary-title" 
                    style={{ 
                        color: color,
                        borderColor: `${color}40`,
                    }}
                >
                    {title}
                </div>
            )}
        </div>
    );
};

export default memo(MindMapBoundaryNode);
