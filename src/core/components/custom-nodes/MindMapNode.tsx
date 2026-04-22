import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { NodeToolbar } from '@xyflow/react';
import { MindMapActionBar } from '../diagrams/mindmap-pro/MindMapActionBar';
import { FaMinus } from 'react-icons/fa';
import { ExportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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
    /** T-3: External URL link for this node. Shows a link icon; click opens in new tab. */
    url?: string;
    /** T-4: Priority marker. 1=Low (blue), 2=Medium (orange), 3=High (red). */
    priority?: 1 | 2 | 3;
    /** T-5: Progress marker (0/25/50/75/100). Renders a small SVG arc ring at the bottom of the node. */
    progress?: 0 | 25 | 50 | 75 | 100;
    summaryBracket?: {
        minY: number;
        maxY: number;
        dir: 'L' | 'R';
    };
}


const MindMapNode = ({ id, data, isConnectable, selected }: NodeProps<Node<MindMapNodeData, 'mindmap'>>) => {
    // depth=0 for root node. Root nodes may not have depth set, but they always have 'direction'.
    // When depth is undefined, check for 'direction' (root-only prop) to detect root node.
    const rawDepth = data?.depth;
    const depth = rawDepth !== undefined ? rawDepth : (data?.direction !== undefined ? 0 : 1);
    const direction = data?.direction ?? 'LR';
    const branchColor = data?.branchColor;
    const shape = data?.shape || 'underline';
    const collapsed = !!data?.collapsed;
    const childrenCount = data?.childrenCount ?? 0;
    const { t } = useTranslation();
    
    // Rich Content
    const icon = data?.icon;
    const image = data?.image;
    const note = data?.note;
    const tags = data?.tags || [];
    // [T-3] URL link
    const url = data?.url as string | undefined;
    // [T-4] Priority marker
    const priority = data?.priority as (1 | 2 | 3) | undefined;
    // [T-5] Progress ring
    const progress = data?.progress as (0 | 25 | 50 | 75 | 100) | undefined;
    
    // Inline Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(data?.label || '');
    const inputRef = useRef<HTMLInputElement>(null);
    const { updateNodeData } = useReactFlow();

    // Sync editValue when label changes externally (e.g. via undo/redo or outline panel)
    useEffect(() => {
        if (!isEditing) {
            setEditValue(data?.label || '');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.label]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            // Guarantee DOM attachment for rock-solid continuous input workflow
            requestAnimationFrame(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                }
            });
        }
    }, [isEditing]);

    useEffect(() => {
        if (data?.isNew) {
            setEditValue(''); // Start fresh for new nodes
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

    // depth-0: no branch-color (handled by CSS gradient directly)
    // depth>0: inject --branch-color CSS variable to drive all styling
    const themeStyle = depth > 0 && branchColor ? {
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
                        data?.label
                            ? data.label
                            : <span style={{ opacity: 0.35, fontStyle: 'italic', userSelect: 'none' }}>
                                {depth === 0 ? t('designer.flowchart.mindMapCenter') : t('plugins.mindmap.actionBar.addChild')}
                              </span>
                    )}
                </div>
                {/* [T-3] URL link icon — click opens URL in new tab */}
                {url && !isEditing && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mindmap-url-icon"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={url}
                    >
                        <ExportOutlined style={{ fontSize: 11, color: '#6366f1', opacity: 0.7 }} />
                    </a>
                )}
            </div>

            {/* [T-4] Priority badge — absolute positioned top-right corner */}
            {priority && (
                <span className={`mindmap-priority-badge priority-${priority}`}>
                    {priority === 1 ? '!' : priority === 2 ? '!!' : '!!!'}
                </span>
            )}

            {/* [T-5] Progress ring — bottom-center SVG arc, XMind-style */}
            {progress !== undefined && progress > 0 && (() => {
                const R = 7; // radius
                const C = 2 * Math.PI * R; // circumference ≈ 43.98
                const dash = (progress / 100) * C;
                const color = progress === 100 ? '#10b981' : branchColor || '#6366f1';
                return (
                    <span className="mindmap-progress-ring" title={`进度 ${progress}%`}>
                        <svg width="18" height="18" viewBox="0 0 18 18">
                            {/* Track */}
                            <circle cx="9" cy="9" r={R} fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
                            {/* Progress arc — starts at 12 o'clock (-90deg) */}
                            <circle
                                cx="9" cy="9" r={R}
                                fill="none"
                                stroke={color}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeDasharray={`${dash} ${C}`}
                                transform="rotate(-90 9 9)"
                                style={{ transition: 'stroke-dasharray 0.4s ease' }}
                            />
                        </svg>
                    </span>
                );
            })()}

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
