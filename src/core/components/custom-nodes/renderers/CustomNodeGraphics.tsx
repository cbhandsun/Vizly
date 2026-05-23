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
const HANDLE_SIDES = [
    { full: 'top', short: 't', position: Position.Top },
    { full: 'bottom', short: 'b', position: Position.Bottom },
    { full: 'right', short: 'r', position: Position.Right },
    { full: 'left', short: 'l', position: Position.Left },
] as const;

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
    /** 如果用户未设置图标，由 hook 追传过来的自动推断图标 */
    resolvedIcon?: string | null;
}

// 解析节点文本：第一行是标题，其余是描述
const parseNodeContent = (raw: string): { title: string; body: string } => {
    if (!raw) return { title: '', body: '' };
    // 处理 <br> 分隔
    const parts = raw.split(/<br\s*\/?>/i);
    if (parts.length > 1) {
        return { title: parts[0].replace(/<[^>]+>/g, '').trim(), body: parts.slice(1).join('\n').replace(/<[^>]+>/g, '').trim() };
    }
    // 处理 \n 分隔
    const lines = raw.split('\n');
    if (lines.length > 1) {
        return { title: lines[0].trim(), body: lines.slice(1).join('\n').trim() };
    }
    return { title: raw.trim(), body: '' };
};

const CustomNodeGraphicsComponent: React.FC<CustomNodeGraphicsProps> = ({
    _id,
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
    statusStripeProps,
    resolvedIcon,
}) => {
    // 实际使用的图标：用户手动 > hook 推断 > null
    const _effectiveIcon = d?.icon || resolvedIcon || null;

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

        // 使用结构化排版（标题 + 描述体）
        const { title, body } = parseNodeContent(content);

        // 是否有 HTML 内容（旧格式兼容）
        const hasHtml = content.includes('<br>') || content.includes('<b>') || content.includes('<strong>');

        if (hasHtml) {
            // 旧格式：HTML 直接渲染，保持兼容
            const lines = content.split(/<br\s*\/?>/i);
            return (
                <div style={contentStyle} onDoubleClick={handleDoubleClick}>

                    <div style={textContainerStyle}>
                        {lines.map((line, index) => (
                            <div key={index} style={getLineStyle(line)}>
                                <span dangerouslySetInnerHTML={{ __html: line }} />
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // 新结构化排版：标题行 + 描述正文
        const titleStyle: React.CSSProperties = {
            fontWeight: 600,
            fontSize: contentStyle.fontSize,
            lineHeight: 1.3,
            color: contentStyle.color,
            display: 'block',
            width: '100%',
            letterSpacing: '0.01em',
        };

        const bodyStyle: React.CSSProperties = {
            fontWeight: 400,
            fontSize: `calc(${contentStyle.fontSize} * 0.88)`,
            lineHeight: 1.5,
            color: hexToRgba(String(contentStyle.color || '#374151'), 0.72),
            display: 'block',
            width: '100%',
            marginTop: '4px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
        };

        return (
            <div style={contentStyle} onDoubleClick={handleDoubleClick}>

                <div style={textContainerStyle}>
                    {/* 标题 */}
                    <span style={titleStyle}>{title}</span>
                    {/* 描述正文（多行子弹列表支持） */}
                    {body && (
                        <div style={bodyStyle}>
                            {body.split('\n').map((line, i) => (
                                <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                                    {line.startsWith('•') || line.startsWith('-') || line.startsWith('·') ? (
                                        <>{line}</>
                                    ) : (
                                        <>{line}</>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
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
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {/* 顶部主题色带：始终渲染 */}
                <div style={accentBarProps ?? {
                    position: 'absolute',
                    left: 0, right: 0, top: 0,
                    height: '3px',
                    background: `linear-gradient(90deg, ${themeMain}cc 0%, ${themeMain} 50%, ${themeMain}cc 100%)`,
                    borderTopLeftRadius: 'inherit',
                    borderTopRightRadius: 'inherit',
                    pointerEvents: 'none',
                    zIndex: 5,
                }} />
                {statusStripeProps && <div style={statusStripeProps} />}
                {renderDebugOverlay()}
                {renderContent(rawContent)}

                {/* [FIX] Handle id 统一长格式，与 FlowchartNode 和 DomainDagreLayoutStrategy 的 sourceHandle 对齐 */}
                {!d.isLegend && (
                    <>
                        {HANDLE_SIDES.map(({ full, short, position }) => (
                            <React.Fragment key={full}>
                                <Handle type="target" position={position} id={full} style={edgeHandleStyle} />
                                <Handle type="source" position={position} id={full} style={edgeHandleStyle} />
                                <Handle type="target" position={position} id={short} style={edgeHandleStyle} />
                                <Handle type="source" position={position} id={short} style={edgeHandleStyle} />
                            </React.Fragment>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export const CustomNodeGraphics = React.memo(CustomNodeGraphicsComponent);
