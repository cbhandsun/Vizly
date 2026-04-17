import React, { memo } from 'react';
import { Handle, Position, NodeProps, NodeResizer, Node, useStore } from '@xyflow/react';
import { useFlowchartNodeInteractions } from './hooks/useFlowchartNodeInteractions';
import { Icon } from '@iconify/react';
import './FlowchartNode.css';

export interface IconNodeData {
    icon: string;       // e.g. "logos:react" or "mdi:aws"
    color?: string;     // override color if the icon supports it (e.g. mdi)
    label?: string;     // optional label positioned under the icon
    locked?: boolean;
}

export interface IconNodeProps extends NodeProps<Node<IconNodeData>> { }

const IconNode = ({ data, selected, id }: IconNodeProps) => {
    const nodeData = useStore((s: any) => s.nodeLookup?.get(id) || s.nodeInternals?.get(id));

    // Support NodeResizer dimensions
    const nodeWidth = (nodeData?.measured?.width || (nodeData as any)?.width || 100) as number;
    const nodeHeight = (nodeData?.measured?.height || (nodeData as any)?.height || 100) as number;

    const {
        isHovered,
        setIsHovered,
        bounceAnimate
    } = useFlowchartNodeInteractions(id as string, data, selected);

    return (
        <div
            className={`flowchart-node icon-node ${selected ? 'selected' : ''} ${bounceAnimate ? 'bounce-animate' : ''} ${data.locked ? 'locked' : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                // IconNodes have no background or borders by default to imitate standard vector stencils
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                cursor: 'pointer'
            }}
            title={data.label || data.icon}
        >
            <NodeResizer
                minWidth={32}
                minHeight={32}
                maxWidth={800}
                maxHeight={800}
                color="#3b82f6"
                isVisible={selected}
                handleClassName="flowchart-resize-handle"
                lineClassName="flowchart-resize-line"
                keepAspectRatio={true}
            />

            <div style={{
                flex: 1,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none', // Allow clicks to pass through to the node container
            }}>
                <Icon
                    icon={data.icon}
                    style={{
                        width: '100%',
                        height: '100%',
                        color: data.color || 'inherit',
                        filter: isHovered ? 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.3))' : 'none',
                        transition: 'filter 0.3s ease, transform 0.3s ease',
                        transform: isHovered ? 'scale(1.05)' : 'scale(1)'
                    }}
                />
            </div>

            {(data.label || data.description) && (
                <div style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#4b5563',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    lineHeight: 1.2,
                    maxWidth: '120%',
                    wordBreak: 'break-word',
                    fontFamily: 'Inter, -apple-system, sans-serif'
                }}>
                    {data.label || data.description}
                </div>
            )}

            {(['top', 'right', 'bottom', 'left'] as const).map((dir) => {
                const posMap = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
                return (
                    <Handle
                        key={dir}
                        type="source"
                        position={posMap[dir]}
                        id={dir}
                        // Only show handles on hover or when selected to keep the UI clean
                        className={`flowchart-handle flowchart-handle-bidirectional ${isHovered || selected ? 'visible' : 'hidden'}`}
                        style={{
                            opacity: isHovered || selected ? 1 : 0,
                            pointerEvents: isHovered || selected ? 'all' : 'none',
                            transition: 'opacity 0.2s'
                        }}
                        isConnectableStart={true}
                        isConnectableEnd={true}
                    />
                );
            })}
        </div>
    );
};

export default memo(IconNode);
