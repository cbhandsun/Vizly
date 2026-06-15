import React, { useState, useRef, useEffect, useCallback } from 'react';
import { sanitizeInlineHtml } from '../../utils/sanitizeHtml';

interface EditableLabelProps {
    value: string;
    onChange: (newValue: string) => void;
    style?: React.CSSProperties;
    className?: string;
    isEditing?: boolean;
    autoFocus?: boolean;
    onEditingChange?: (isEditing: boolean) => void;
}

// Mini formatting toolbar for rich text
const FormatToolbar: React.FC<{ onFormat: (cmd: string, val?: string) => void }> = ({ onFormat }) => {
    const btnStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid #d9d9d9',
        borderRadius: 4,
        cursor: 'pointer',
        padding: '2px 6px',
        fontSize: 11,
        lineHeight: '18px',
        color: '#333',
        transition: 'all 0.15s',
    };

    return (
        <div
            style={{
                display: 'flex',
                gap: 2,
                position: 'absolute',
                top: -28,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
                background: '#fff',
                borderRadius: 6,
                padding: '2px 4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                border: '1px solid #e8e8e8',
            }}
            onMouseDown={(e) => e.preventDefault()} // prevent blur
        >
            <button
                style={{ ...btnStyle, fontWeight: 'bold' }}
                onClick={() => onFormat('bold')}
                title="Bold (Ctrl+B)"
            >
                B
            </button>
            <button
                style={{ ...btnStyle, fontStyle: 'italic' }}
                onClick={() => onFormat('italic')}
                title="Italic (Ctrl+I)"
            >
                I
            </button>
            <button
                style={{ ...btnStyle, textDecoration: 'underline' }}
                onClick={() => onFormat('underline')}
                title="Underline (Ctrl+U)"
            >
                U
            </button>
            <div style={{ width: 1, background: '#d9d9d9', margin: '2px 2px' }} />
            <button
                style={btnStyle}
                onClick={() => onFormat('fontSize', '4')}
                title="Larger"
            >
                A↑
            </button>
            <button
                style={{ ...btnStyle, fontSize: 10 }}
                onClick={() => onFormat('fontSize', '2')}
                title="Smaller"
            >
                A↓
            </button>
        </div>
    );
};

// P11: React.memo — 防止父节点重渲染时不必要的标签重渲染
export const EditableLabel: React.FC<EditableLabelProps> = React.memo(({
    value,
    onChange,
    style,
    className,
    isEditing: controlledIsEditing,
    autoFocus = true,
    onEditingChange
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const editRef = useRef<HTMLDivElement>(null);
    const originalValueRef = useRef(value);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        onEditingChange?.(true);
        originalValueRef.current = value;
    };

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        onEditingChange?.(false);
        if (editRef.current) {
            const html = sanitizeInlineHtml(editRef.current.innerHTML);
            // Normalize: if content is just plain text (no tags), store as plain text
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const hasFormatting = tempDiv.querySelector('b, i, u, strong, em, font, span[style]');
            const finalValue = hasFormatting ? html : (tempDiv.textContent || '');
            if (finalValue !== value) {
                onChange(finalValue);
            }
        }
    }, [value, onChange, onEditingChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleBlur();
        } else if (e.key === 'Escape') {
            if (editRef.current) {
                editRef.current.innerHTML = sanitizeInlineHtml(originalValueRef.current);
            }
            setIsEditing(false);
            onEditingChange?.(false);
        }
        // Stop propagation to prevent node shortcuts
        e.stopPropagation();
    };

    const handleFormat = useCallback((cmd: string, val?: string) => {
        document.execCommand(cmd, false, val);
        editRef.current?.focus();
    }, []);

    // Auto-focus and select
    useEffect(() => {
        if ((isEditing || controlledIsEditing) && autoFocus && editRef.current) {
            const el = editRef.current;
            setTimeout(() => {
                el.focus();
                // Select all content
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }, 50);
        }
    }, [isEditing, controlledIsEditing, autoFocus]);

    if (isEditing || controlledIsEditing) {
        return (
            <div style={{ position: 'relative', display: 'inline-block', minWidth: 60 }}>
                <FormatToolbar onFormat={handleFormat} />
                <div
                    ref={editRef}
                    contentEditable
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(value) }}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    style={{
                        ...style,
                        textAlign: 'center',
                        minWidth: 60,
                        fontSize: 'inherit',
                        padding: '2px 6px',
                        outline: 'none',
                        border: '1px solid #1890ff',
                        borderRadius: 4,
                        boxShadow: '0 0 0 2px rgba(24,144,255,0.2)',
                        background: 'rgba(255,255,255,0.95)',
                        cursor: 'text',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                    className={className}
                />
            </div>
        );
    }

    return (
        <span
            onDoubleClick={handleDoubleClick}
            style={{ cursor: 'text', ...style }}
            className={className}
            dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(value) }}
        />
    );
});
