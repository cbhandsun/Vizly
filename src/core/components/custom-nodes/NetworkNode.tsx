import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node, useStore } from '@xyflow/react';
import { Icon } from '@iconify/react';

export interface NetworkNodeData extends Record<string, unknown> {
    icon: string;       // e.g. "logos:aws", "logos:google-cloud"
    label: string;
    themeColor?: string;
    description?: string;
}

const NetworkNode: React.FC<NodeProps<Node<NetworkNodeData>>> = ({ id, data, selected }) => {
    const nodeData = useStore((s: any) => s.nodeLookup?.get(id) || s.nodeInternals?.get(id));
    
    // 获取尺寸，支持 NodeResizer 的变更
    const _width = (nodeData?.measured?.width || (nodeData as any)?.width || 60) as number;
    const _height = (nodeData?.measured?.height || (nodeData as any)?.height || 60) as number;

    const themeColor = data.themeColor || '#3b82f6';

    return (
        <div 
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: '4px',
                transition: 'all 0.2s ease',
                filter: selected ? `drop-shadow(0 0 8px ${themeColor}40)` : 'none',
            }}
        >
            {/* 选中态指示框 */}
            {selected && (
                <div style={{
                    position: 'absolute',
                    inset: -4,
                    border: `2px solid ${themeColor}`,
                    borderRadius: 8,
                    pointerEvents: 'none',
                    animation: 'pulse 2s infinite'
                }} />
            )}

            <div style={{
                flex: 1,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
            }}>
                <Icon
                    icon={data.icon}
                    style={{
                        width: '80%',
                        height: '80%',
                        color: themeColor,
                        filter: selected ? 'drop-shadow(0 0 2px rgba(0,0,0,0.1))' : 'none',
                    }}
                />
            </div>

            {/* 标签 */}
            {(data.label || data.description) && (
                <div style={{
                    marginTop: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#334155',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    maxWidth: '140%',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.8)',
                    padding: '0 4px',
                    borderRadius: 4,
                }}>
                    {data.label}
                </div>
            )}

            {/* 连接点 */}
            {(['top', 'right', 'bottom', 'left'] as const).map((dir) => {
                const posMap = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
                return (
                    <Handle
                        key={dir}
                        type="source"
                        position={posMap[dir]}
                        id={dir}
                        style={{
                            width: 6,
                            height: 6,
                            background: themeColor,
                            border: '1.5px solid #fff',
                            opacity: selected ? 1 : 0,
                            transition: 'opacity 0.2s',
                        }}
                    />
                );
            })}

            <style>{`
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${themeColor}40; }
                    70% { box-shadow: 0 0 0 6px ${themeColor}00; }
                    100% { box-shadow: 0 0 0 0 ${themeColor}00; }
                }
            `}</style>
        </div>
    );
};

export default memo(NetworkNode);
