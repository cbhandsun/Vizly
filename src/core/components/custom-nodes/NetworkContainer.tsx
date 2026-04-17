import React, { memo } from 'react';
import { NodeProps, Node, NodeResizer } from '@xyflow/react';
import { Icon } from '@iconify/react';

export interface NetworkContainerData extends Record<string, unknown> {
    label: string;
    icon?: string;      // 标题栏图标
    themeColor?: string;
    borderStyle?: 'solid' | 'dashed';
    headerBackground?: string;
}

const NetworkContainer: React.FC<NodeProps<Node<NetworkContainerData>>> = ({ data, selected }) => {
    const themeColor = data.themeColor || '#64748b';
    const borderStyle = data.borderStyle || 'solid';

    return (
        <div style={{
            width: '100%',
            height: '100%',
            minWidth: 160,
            minHeight: 120,
            background: `${themeColor}08`,
            border: `1.5px ${borderStyle} ${themeColor}80`,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.3s ease',
            boxShadow: selected ? `0 0 0 2px ${themeColor}, 0 12px 24px -10px ${themeColor}40` : '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        }}>
            <NodeResizer
                minWidth={100}
                minHeight={80}
                isVisible={selected}
                lineClassName="flowchart-resize-line"
                handleClassName="flowchart-resize-handle"
            />

            {/* Header */}
            <div style={{
                padding: '6px 12px',
                background: data.headerBackground || `${themeColor}15`,
                borderBottom: `1px solid ${themeColor}20`,
                display: 'flex',
                alignItems: 'center',
                gap: 8
            }}>
                {data.icon && (
                    <Icon icon={data.icon} style={{ fontSize: 16, color: themeColor }} />
                )}
                <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: themeColor,
                    letterSpacing: '0.025em',
                    textTransform: 'uppercase'
                }}>
                    {data.label}
                </span>
            </div>

            {/* Content Area (Placeholder for children) */}
            <div style={{ flex: 1, position: 'relative' }}>
                {/* 
                    xyflow 会自动将子节点渲染在这个 div 之上（基于其坐标）
                    我们这里主要是提供背景和边框
                */}
            </div>
            
            {/* Hover/Selection effect overlay */}
            <div style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: selected ? `${themeColor}05` : 'transparent',
                transition: 'background 0.2s ease',
            }} />
        </div>
    );
};

export default memo(NetworkContainer);
