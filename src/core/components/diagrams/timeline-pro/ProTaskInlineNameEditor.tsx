import React from 'react';

interface ProTaskInlineNameEditorProps {
    accessibleTaskName: string;
    isEditing: boolean;
    taskName: string;
    value: string;
    width: number | string;
    onCancel: () => void;
    onChange: (value: string) => void;
    onCommit: () => void;
    onStart: () => void;
}

export function ProTaskInlineNameEditor({
    accessibleTaskName,
    isEditing,
    taskName,
    value,
    width,
    onCancel,
    onChange,
    onCommit,
    onStart,
}: ProTaskInlineNameEditorProps) {
    if (!isEditing) {
        return (
            <span
                title="双击编辑任务名称，或聚焦任务后按 F2"
                onDoubleClick={(event) => {
                    event.stopPropagation();
                    onStart();
                }}
            >
                {taskName}
            </span>
        );
    }

    return (
        <input
            autoFocus
            aria-label={`编辑 ${accessibleTaskName} 的任务名称`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onCommit}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                    event.preventDefault();
                    onCommit();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    onCancel();
                }
            }}
            style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'inherit',
                fontWeight: 'inherit',
                fontSize: 'inherit',
                width,
                padding: 0,
            }}
        />
    );
}
