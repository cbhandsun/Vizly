import React, { memo, useRef, useEffect } from 'react';
import { NodeProps, Node } from '@xyflow/react';
import { useNodeUpdate } from '../diagrams/useNodeUpdate';
import { useDiagramStylePreset_v2 } from '../../hooks/useDiagramStylePreset_v2';
import './StickyNoteNode.css';
import type { NodeDataUpdate } from '../../types/diagram-updates';
import type { ToolbarFeature } from '../diagrams/FloatingContextToolbar';

export interface StickyNoteData {
    label?: string;
    noteColor?: 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'purple';
    locked?: boolean;
    isEditing?: boolean;
    [key: string]: unknown;
}

const colorMap = {
    yellow: '#feff9c',
    pink: '#ff7eb9',
    blue: '#7afcff',
    green: '#8aff80',
    orange: '#ffc874',
    purple: '#e2afff',
};

const StickyNoteNode: React.FC<NodeProps<Node<StickyNoteData, 'sticky-note'>>> = ({ data, selected, id }) => {
    const preset = useDiagramStylePreset_v2();
    const isSketch = preset.name === 'sketch';
    const onUpdateNodeData = useNodeUpdate();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-focus when node starts out in isEditing mode
    useEffect(() => {
        if (data.isEditing && textareaRef.current) {
            textareaRef.current.focus();
            // Automatically select text so user can just start replacing
            textareaRef.current.select();
        }
    }, [data.isEditing]);

    const handleLabelChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (data.locked) return;
        const newLabel = e.target.value;
        if (onUpdateNodeData) {
            onUpdateNodeData([id], { data: { ...data, label: newLabel } });
        }
        
        // Auto-resize textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    };

    const stopEditing = () => {
        if (data.isEditing && onUpdateNodeData) {
            onUpdateNodeData([id], { data: { ...data, isEditing: false } });
        }
    };

    const startEditing = (e: React.MouseEvent) => {
        if (data.locked) return;
        e.stopPropagation();
        if (onUpdateNodeData) {
            onUpdateNodeData([id], { data: { ...data, isEditing: true } });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Esc to stop editing
        if (e.key === 'Escape') {
            stopEditing();
            e.stopPropagation();
        }
        // Don't swallow enter so people can type multiple lines
        e.stopPropagation(); 
    };

    const bgColor = colorMap[(data.noteColor || 'yellow') as keyof typeof colorMap] || colorMap.yellow;
    const rotation = isSketch ? 'rotate(-2deg)' : 'rotate(-0.5deg)';

    // Adjust height on load based on content if not editing
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [data.label]);

    return (
        <div 
            className={`sticky-note-node ${selected ? 'selected' : ''} ${isSketch ? 'sketch-mode' : ''} ${data.isEditing ? 'editing' : ''}`}
            style={{
                backgroundColor: bgColor,
                transform: rotation,
                boxShadow: selected ? '0 10px 24px rgba(0,0,0,0.15)' : '0 4px 6px rgba(0,0,0,0.1)',
            }}
        >
            {/* No Handles for sticky notes! They should be pure annotation layers */}
            <div className="sticky-note-content" onDoubleClick={startEditing}>
                <div className="sticky-fold" style={{ borderBottomColor: bgColor }} />
                
                {data.isEditing ? (
                    <textarea
                        ref={textareaRef}
                        className="sticky-note-textarea"
                        value={data.label || ''}
                        onChange={handleLabelChange}
                        onBlur={stopEditing}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a note..."
                        style={{
                            fontFamily: isSketch ? '"Comic Sans MS", "Chalkboard SE", sans-serif' : 'inherit',
                        }}
                    />
                ) : (
                    <div 
                        className="sticky-note-plaintext nodrag"
                        style={{
                            fontFamily: isSketch ? '"Comic Sans MS", "Chalkboard SE", sans-serif' : 'inherit',
                        }}
                    >
                        {data.label || 'Double click to edit'}
                    </div>
                )}
            </div>
        </div>
    );
};

// 🌟 Extend the floating toolbar dynamically for this specific node
const StickyNoteToolbarExtension: React.FC<{
    node: Node<StickyNoteData>;
    updateNodesBatch: (ids: string[], data: NodeDataUpdate) => void;
}> = ({ node, updateNodesBatch }) => {
    const handleColorChange = (color: keyof typeof colorMap) => {
        updateNodesBatch([node.id], { data: { ...node.data, noteColor: color } });
    };

    return (
        <div style={{ display: 'flex', gap: '6px', padding: '0 8px', alignItems: 'center', borderRight: '1px solid rgba(0,0,0,0.06)' }}>
            {Object.keys(colorMap).map((color) => (
                <button
                    key={color}
                    className={`color-blob ${node.data?.noteColor === color ? 'active' : (color === 'yellow' && (!node.data || !node.data.noteColor) ? 'active' : '')}`}
                    style={{ backgroundColor: colorMap[color as keyof typeof colorMap] }}
                    onClick={() => handleColorChange(color as keyof typeof colorMap)}
                    title={color}
                />
            ))}
        </div>
    );
};

const MemoizedStickyNoteNode = memo(StickyNoteNode);
type StickyNoteNodeWithToolbar = typeof MemoizedStickyNoteNode & {
    ToolbarFeatureExclusions: ToolbarFeature[];
    ToolbarExtension: typeof StickyNoteToolbarExtension;
};
const StickyNoteNodeComponent = MemoizedStickyNoteNode as StickyNoteNodeWithToolbar;

// Exclude generic features from the global floating toolbar since they don't apply well to sticky notes
StickyNoteNodeComponent.ToolbarFeatureExclusions = ['color', 'shape', 'domain', 'border', 'align', 'opacity', 'copyStyle'];
StickyNoteNodeComponent.ToolbarExtension = StickyNoteToolbarExtension;

export default StickyNoteNodeComponent;
