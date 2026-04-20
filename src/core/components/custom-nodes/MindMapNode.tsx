import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { NodeToolbar } from '@xyflow/react';
import { MindMapActionBar } from '../diagrams/mindmap-pro/MindMapActionBar';
import { FaMinus } from 'react-icons/fa';
import './MindMapNode.css';

export interface MindMapNodeData extends Record<string, unknown> {
    label?: string;
    depth?: number;
    color?: string;
    direction?: 'LR' | 'TB' | 'BT' | 'R' | 'L' | 'FISHBONE';
    branchColor?: string;
    isNew?: boolean;
    shape?: 'underline' | 'pill' | 'box';
    pathStyle?: 'bezier' | 'straight' | 'step';
    collapsed?: boolean;
    childrenCount?: number;
    icon?: string;
    image?: string;
    note?: string;
    tags?: string[];
    summaryBracket?: {
        minY: number;
        maxY: number;
        dir: 'L' | 'R';
    };
}

const MindMapNode = ({ id, data, isConnectable, selected }: NodeProps<Node<MindMapNodeData, 'mindmap'>>) => {
    const depth = data?.depth ?? 1; 
    const direction = data?.direction ?? 'LR';
    const branchColor = data?.branchColor;
    const shape = data?.shape || 'underline';
    const collapsed = !!data?.collapsed;
    const childrenCount = data?.childrenCount ?? 0;
    
    // Rich Content
    const icon = data?.icon;
    const image = data?.image;
    const note = data?.note;
    const tags = data?.tags || [];
    
    // Inline Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(data?.label || (depth === 0 ? 'Main Idea' : 'Branch'));
    const inputRef = useRef<HTMLInputElement>(null);
    const { updateNodeData } = useReactFlow();

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        if (data?.isNew) {
            setIsEditing(true);
            updateNodeData(id, { isNew: undefined });
        }
    }, [data?.isNew, id, updateNodeData]);

    useEffect(() => {
        const handleRemoteEdit = (e: Event) => {
            if ((e as CustomEvent).detail.nodeId === id) {
                setIsEditing(true);
            }
        };
        window.addEventListener('mindmap:edit', handleRemoteEdit);
        return () => window.removeEventListener('mindmap:edit', handleRemoteEdit);
    }, [id]);

    const handleToggleCollapse = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        updateNodeData(id, { collapsed: !collapsed });
    }, [id, collapsed, updateNodeData]);

    const handleSave = () => {
        if (isEditing) {
            setIsEditing(false);
            updateNodeData(id, { label: editValue });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
            e.preventDefault();
            handleSave();
            setTimeout(() => window.dispatchEvent(new CustomEvent('mindmap:shortcut-trigger', { detail: { key: 'Enter', nodeId: id } })), 10);
        } else if (e.key === 'Tab') {
            e.stopPropagation();
            e.preventDefault();
            handleSave();
            setTimeout(() => window.dispatchEvent(new CustomEvent('mindmap:shortcut-trigger', { detail: { key: 'Tab', nodeId: id } })), 10);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            setIsEditing(false);
            setEditValue(data?.label || '');
        }
    };

    const themeStyle = branchColor && depth > 0 ? {
        '--branch-color': branchColor,
    } as React.CSSProperties : {};

    const side = (data?.side as 'left' | 'right' | 'root') || 'right';
    const isLeft = side === 'left';

    return (
        <div 
            className={`mindmap-node depth-${depth} shape-${shape} ${selected ? 'selected' : ''} ${collapsed ? 'collapsed' : ''}`}
            style={themeStyle}
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
        >
            <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
                <MindMapActionBar />
            </NodeToolbar>

            {depth > 0 && (
                <Handle
                    type="target"
                    position={
                        direction === 'L' ? Position.Right :
                        direction === 'R' ? Position.Left :
                        direction === 'FISHBONE' ? Position.Right :
                        direction === 'TB' ? Position.Top :
                        direction === 'BT' ? Position.Bottom :
                        direction === 'LR' ? (isLeft ? Position.Right : Position.Left) : Position.Top
                    }
                    isConnectable={isConnectable}
                    className="mindmap-handle"
                    style={depth > 0 && !['TB', 'BT'].includes(direction) ? { top: 'auto', bottom: '1px', transform: (direction === 'L' || direction === 'FISHBONE' || (direction === 'LR' && isLeft)) ? 'translate(50%, 50%)' : 'translate(-50%, 50%)' } : { borderRadius: '50%' }}
                />
            )}

            {image && (
                <div className="mindmap-image-wrapper">
                    <img src={image} alt="Node Graphic" className="mindmap-image" />
                </div>
            )}

            <div className="mindmap-label-wrapper">
                {icon && <span className="mindmap-icon">{icon}</span>}
                <div className="mindmap-label">
                    {isEditing ? (
                        <input 
                            ref={inputRef}
                            className="mindmap-inline-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                    ) : (
                        data?.label || (depth === 0 ? 'Main Idea' : 'Branch')
                    )}
                </div>
            </div>

            {(note || tags.length > 0) && !isEditing && (
                <div className="mindmap-rich-footer">
                    {note && <div className="mindmap-note">{note}</div>}
                    {tags.length > 0 && (
                        <div className="mindmap-tags">
                            {tags.map((t, i) => <span key={i} className="mindmap-tag">{t}</span>)}
                        </div>
                    )}
                </div>
            )}

            {/* Professional Summary Bracket */}
            {(() => {
                const summaryBracket = data.summaryBracket;
                if (!summaryBracket) return null;

                const { minY, maxY, dir } = summaryBracket;
                const hHeight = Math.abs(maxY - minY);
                const cY = hHeight / 2;
                const isSummaryLeft = dir === 'L';
                
                const r = 8;
                const d = isSummaryLeft
                    ? `M 15 0 C 8 0 8 ${r} 8 ${r} L 8 ${cY-r} C 8 ${cY} 0 ${cY} 0 ${cY} C 8 ${cY} 8 ${cY} 8 ${cY+r} L 8 ${hHeight-r} C 8 ${hHeight-r} 8 ${hHeight} 15 ${hHeight}`
                    : `M 0 0 C 7 0 7 ${r} 7 ${r} L 7 ${cY-r} C 7 ${cY} 15 ${cY} 15 ${cY} C 7 ${cY} 7 ${cY} 7 ${cY+r} L 7 ${hHeight-r} C 7 ${hHeight-r} 7 ${hHeight} 0 ${hHeight}`;

                return (
                    <svg
                        style={{
                            position: 'absolute',
                            top: minY,
                            left: isSummaryLeft ? 'auto' : 'calc(100% + 8px)',
                            right: isSummaryLeft ? 'calc(100% + 8px)' : 'auto',
                            height: hHeight,
                            width: 15,
                            pointerEvents: 'none',
                            overflow: 'visible',
                            zIndex: 10
                        }}
                    >
                        <path 
                            d={d} 
                            stroke="#8e9aaf" 
                            fill="none" 
                            strokeWidth={1.8} 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                        />
                    </svg>
                );
            })()}

            {depth === 0 ? (
                <>
                    {direction === 'TB' ? (
                        <Handle type="source" id="source-bottom" position={Position.Bottom} isConnectable={isConnectable} className="mindmap-handle" />
                    ) : direction === 'BT' ? (
                        <Handle type="source" id="source-top" position={Position.Top} isConnectable={isConnectable} className="mindmap-handle" />
                    ) : direction === 'R' ? (
                        <Handle type="source" id="source-right" position={Position.Right} isConnectable={isConnectable} className="mindmap-handle" />
                    ) : direction === 'L' || direction === 'FISHBONE' ? (
                        <Handle type="source" id="source-left" position={Position.Left} isConnectable={isConnectable} className="mindmap-handle" />
                    ) : (
                        <>
                            <Handle type="source" id="source-right" position={Position.Right} isConnectable={isConnectable} className="mindmap-handle" />
                            <Handle type="source" id="source-left" position={Position.Left} isConnectable={isConnectable} className="mindmap-handle" />
                        </>
                    )}
                </>
            ) : (
                <>
                    <Handle
                        type="source"
                        position={
                            direction === 'L' ? Position.Left :
                            direction === 'R' ? Position.Right :
                            direction === 'FISHBONE' ? Position.Left :
                            direction === 'TB' ? Position.Bottom :
                            direction === 'BT' ? Position.Top :
                            direction === 'LR' ? (isLeft ? Position.Left : Position.Right) : Position.Bottom
                        }
                        isConnectable={isConnectable}
                        className="mindmap-handle"
                        style={!['TB', 'BT'].includes(direction) ? { top: 'auto', bottom: '1px', transform: (direction === 'L' || direction === 'FISHBONE' || (direction === 'LR' && isLeft)) ? 'translate(-50%, 50%)' : 'translate(50%, 50%)' } : { borderRadius: '50%' }}
                    />
                    {childrenCount > 0 && (
                        <div 
                            className={`mindmap-collapse-toggle ${direction === 'L' || (direction === 'LR' && isLeft) ? 'dir-left' : 'dir-right'} dir-${direction}`}
                            onClick={handleToggleCollapse}
                        >
                            {collapsed ? <span className="mindmap-collapse-count">{childrenCount}</span> : <FaMinus size={10} />}
                        </div>
                    )}
                </>
            )}

            <Handle
                type="source"
                id="relationship-source"
                position={Position.Top}
                isConnectable={isConnectable}
                className="mindmap-relationship-handle"
                title="Drag to create logic link"
                style={{ top: '-10px', bottom: 'auto' }}
            />
            <Handle
                type="target"
                id="relationship-target"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="mindmap-relationship-handle"
                title="Drop to complete logic link"
                style={{ top: 'auto', bottom: '-10px' }}
            />
        </div>
    );
};

export default memo(MindMapNode);
