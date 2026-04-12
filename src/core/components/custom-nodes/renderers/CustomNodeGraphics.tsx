import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';

const hexToRgba = (hex: string, alpha: number): string => {
    if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        return `rgba(200, 200, 200, ${alpha})`;
    }
    let c: string[] = hex.substring(1).split('');
    if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    const num = parseInt(c.join(''), 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
};

const edgeHandleStyle = { background: 'transparent', width: '1px', height: '1px', zIndex: 10 };

export interface CustomNodeGraphicsProps {
    id: string;
    data: any;
    selected: boolean;
    setHovered: (hovered: boolean) => void;
    
    // Interactions
    isEditing: boolean;
    editText: string;
    setEditText: (text: string) => void;
    handleDoubleClick: (e: React.MouseEvent) => void;
    handleBlur: () => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;

    // Styles
    debugEnabled: boolean;
    domainKey: string;
    themeMain: string;
    themeBorder: string;
    containerStyle: React.CSSProperties;
    contentStyle: React.CSSProperties;
    textContainerStyle: React.CSSProperties;
    getLineStyle: (line: string) => React.CSSProperties;
    accentBarProps: React.CSSProperties | null;
    statusStripeProps: React.CSSProperties | null;
}

const CustomNodeGraphicsComponent: React.FC<CustomNodeGraphicsProps> = ({
    id,
    data: d,
    selected,
    setHovered,
    isEditing,
    editText,
    setEditText,
    handleDoubleClick,
    handleBlur,
    handleKeyDown,
    debugEnabled,
    domainKey,
    themeMain,
    themeBorder,
    containerStyle,
    contentStyle,
    textContainerStyle,
    getLineStyle,
    accentBarProps,
    statusStripeProps
}) => {

    const renderDebugOverlay = () => {
        if (!debugEnabled) return null;
        const labelText = `${String(d?.domainClass || '—')} | ${String(domainKey || '')}`;
        return (
            <div
                style={{
                    position: 'absolute',
                    top: 4, left: 4, padding: '2px 6px',
                    borderRadius: 6, fontSize: 11, lineHeight: '14px',
                    color: '#111', background: 'rgba(255,255,255,0.75)',
                    border: `1px solid ${themeBorder}`,
                    display: 'flex', alignItems: 'center', gap: 6,
                    pointerEvents: 'none',
                    zIndex: (d.baseZIndex || 2) + 200 + (selected ? 100 : 0),
                }}
                title="domainClass | 域键"
            >
                <span>{labelText}</span>
                <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: themeMain, border: `1px solid ${themeBorder}`,
                    boxShadow: `0 0 0 1px ${hexToRgba(themeMain, 0.2)}`,
                    display: 'inline-block',
                }} />
            </div>
        );
    };

    const renderContent = (content: string) => {
        if (isEditing) {
            return (
                <div style={contentStyle}>
                    {d.icon && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', fontSize: '14px', flexShrink: 0 }}>
                            {d.icon}
                        </div>
                    )}
                    <textarea
                        aria-label="Edit Node Text"
                        className="nodrag"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={handleBlur}
                        autoFocus
                        style={{
                            ...contentStyle,
                            display: 'block', flex: 1, width: 'auto', height: 'auto', minWidth: '50px',
                            resize: 'none',
                            background: 'rgba(255,255,255,0.5)', border: `1px dashed ${themeBorder}`,
                            borderRadius: '2px', outline: 'none', padding: '2px', margin: 0,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden',
                            fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', lineHeight: 'inherit', textAlign: 'inherit'
                        }}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            );
        }

        if (!content) return null;

        const contentBody = () => {
            if (content.includes('<br>') || content.includes('<b>') || content.includes('<strong>')) {
                const lines = content.split(/<br\s*\/?>/i);
                return (
                    <div style={textContainerStyle}>
                        {lines.map((line, index) => (
                            <div key={index} style={getLineStyle(line)}>
                                <span dangerouslySetInnerHTML={{ __html: line }} />
                            </div>
                        ))}
                    </div>
                );
            }

            const lines = content.split('\n');
            return (
                <div style={textContainerStyle}>
                    {lines.map((line, index) => (
                        <div key={index} style={getLineStyle(line)}>
                            {line}
                        </div>
                    ))}
                </div>
            );
        };

        return (
            <div style={contentStyle} onDoubleClick={handleDoubleClick}>
                {d.icon && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', fontSize: '14px', flexShrink: 0 }}>
                        {d.icon}
                    </div>
                )}
                {contentBody()}
            </div>
        )
    };

    const rawContent = String(d?.description ?? '');

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <NodeResizer
                minWidth={80} minHeight={40} maxWidth={800} maxHeight={600}
                color="#3b82f6" isVisible={selected}
                handleClassName="flowchart-resize-handle" lineClassName="flowchart-resize-line"
            />

            <div
                style={containerStyle}
                className={`diagram-node-glass diagram-node-hover-glow ${selected ? 'diagram-node-selected' : ''}`.trim()}
                onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 2px 8px -1px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06)`;
                    setHovered(true);
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '';
                    setHovered(false);
                }}
            >
                {accentBarProps && <div style={accentBarProps} />}
                {statusStripeProps && <div style={statusStripeProps} />}
                {renderDebugOverlay()}
                {renderContent(rawContent)}

                {!d.isLegend && (
                    <>
                        <Handle type="target" position={Position.Top} id="t" style={edgeHandleStyle} />
                        <Handle type="source" position={Position.Top} id="t" style={edgeHandleStyle} />
                        <Handle type="target" position={Position.Bottom} id="b" style={edgeHandleStyle} />
                        <Handle type="source" position={Position.Bottom} id="b" style={edgeHandleStyle} />
                        <Handle type="target" position={Position.Right} id="r" style={edgeHandleStyle} />
                        <Handle type="source" position={Position.Right} id="r" style={edgeHandleStyle} />
                        <Handle type="target" position={Position.Left} id="l" style={edgeHandleStyle} />
                        <Handle type="source" position={Position.Left} id="l" style={edgeHandleStyle} />
                    </>
                )}
            </div>
        </div>
    );
};

export const CustomNodeGraphics = React.memo(CustomNodeGraphicsComponent);
