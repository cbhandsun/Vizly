import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { NodeToolbar } from '@xyflow/react';
import { MindMapActionBar } from '../diagrams/mindmap-pro/MindMapActionBar';
import { FaGripLines, FaRegSquare, FaCircle, FaPlus, FaMinus } from 'react-icons/fa';
import './MindMapNode.css';

export interface MindMapNodeData extends Record<string, unknown> {
    label?: string;
    depth?: number;
    color?: string;
    direction?: 'LR' | 'TB' | 'R' | 'L';
    branchColor?: string;
    isNew?: boolean;
    shape?: 'underline' | 'pill' | 'box';
    pathStyle?: 'bezier' | 'straight' | 'step';
    collapsed?: boolean;
    childrenCount?: number;
    // Phase 3: Rich Content
    icon?: string;
    image?: string;
    note?: string;
    tags?: string[];
}

interface MindMapNodeProps extends Partial<NodeProps<Node<MindMapNodeData, 'mindmap'>>> {
    id: string;
    data: MindMapNodeData;
    isConnectable?: boolean;
    selected?: boolean;
}

const MindMapNode = ({ id, data, isConnectable, selected }: MindMapNodeProps) => {
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

    // Auto-focus when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Zero-Click Editing Trigger
    useEffect(() => {
        if (data?.isNew) {
            setIsEditing(true);
            // Remove the flag so it only triggers once upon creation
            updateNodeData(id, { isNew: undefined });
        }
    }, [data?.isNew, id, updateNodeData]);

    // Remote Edit Trigger (F2 / Space)
    useEffect(() => {
        const handleRemoteEdit = (e: Event) => {
            if ((e as CustomEvent).detail.nodeId === id) {
                setIsEditing(true);
            }
        };
        window.addEventListener('mindmap:edit', handleRemoteEdit);
        return () => window.removeEventListener('mindmap:edit', handleRemoteEdit);
    }, [id]);

    // Save logic
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
            setEditValue(data?.label || ''); // Revert
        }
    };

    // Apply color logic
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

            {/* Target Handle (入口) -> Only for non-root */}
            {depth > 0 && (
                <Handle
                    type="target"
                    position={
                        direction === 'L' ? Position.Right :
                        direction === 'R' ? Position.Left :
                        direction === 'LR' ? (isLeft ? Position.Right : Position.Left) : Position.Top
                    }
                    isConnectable={isConnectable}
                    className="mindmap-handle"
                    style={depth > 0 ? { top: 'auto', bottom: '1px', transform: (direction === 'L' || (direction === 'LR' && isLeft)) ? 'translate(50%, 50%)' : 'translate(-50%, 50%)' } : undefined}
                />
            )}

            {/* Rich Image (Rendered above content) */}
            {image && (
                <div className="mindmap-image-wrapper">
                    <img src={image} alt="Node Graphic" className="mindmap-image" />
                </div>
            )}

            {/* Label Content */}
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
                            // Allow typing
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                    ) : (
                        data?.label || (depth === 0 ? 'Main Idea' : 'Branch')
                    )}
                </div>
            </div>

            {/* Rich Note and Tags (Rendered below content) */}
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

            {/* Logic Summary Bracket Rendering */}
            {(() => {
                if (!data.isSummary) return null;
                const bracket = data.summaryBracket as { minY: number, maxY: number, dir: string } | undefined;
                if (!bracket) return null;

                const h = Math.max(bracket.maxY - bracket.minY, 20);
                const cY = h / 2;
                const isLeft = bracket.dir === 'L';
                
                // dir === 'R': Summary is on Right, bracket points Right "}" (targets <- summary)
                // dir === 'L': Summary is on Left, bracket points Left "{" (summary -> targets)
                
                const d = isLeft
                    // Left pointing bracket "{"
                    ? `M 20,0 Q 10,0 10,10 L 10,${cY - 10} Q 10,${cY} 0,${cY} Q 10,${cY} 10,${cY + 10} L 10,${h - 10} Q 10,${h} 20,${h}`
                    // Right pointing bracket "}"
                    : `M 0,0 Q 10,0 10,10 L 10,${cY - 10} Q 10,${cY} 20,${cY} Q 10,${cY} 10,${cY + 10} L 10,${h - 10} Q 10,${h} 0,${h}`;

                return (
                    <svg
                        style={{
                            position: 'absolute',
                            top: bracket.minY,
                            height: h,
                            width: 20,
                            [isLeft ? 'left' : 'right']: 'calc(100% + 5px)',
                            pointerEvents: 'none',
                            overflow: 'visible'
                        }}
                    >
                        <path d={d} stroke="#a0aab5" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                );
            })()}

            {/* Source Handle (出口) */}
            {depth > 0 ? (
                <Handle
                    type="source"
                    position={
                        direction === 'L' ? Position.Left :
                        direction === 'R' ? Position.Right :
                        direction === 'LR' ? (isLeft ? Position.Left : Position.Right) : Position.Bottom
                    }
                    isConnectable={isConnectable}
                    className="mindmap-handle"
                    style={depth > 0 ? { top: 'auto', bottom: '1px', transform: (direction === 'L' || (direction === 'LR' && isLeft)) ? 'translate(-50%, 50%)' : 'translate(50%, 50%)' } : undefined}
                />
            ) : (
                <>
                    {/* Root node needs two source handles to support connections to both sides */}
                    <Handle type="source" id="source-right" position={Position.Right} isConnectable={isConnectable} className="mindmap-handle" />
                    <Handle type="source" id="source-left" position={Position.Left} isConnectable={isConnectable} className="mindmap-handle" />
                </>
            )}

            {/* Relationship Handles (visible on hover) */}
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
