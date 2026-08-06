import React from 'react';

export interface UnifiedDesignerShellProps {
    id: string;
    isDragging?: boolean;
    onDragEnter?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;

    messageContextHolder?: React.ReactNode;
    notificationContextHolder?: React.ReactNode;

    hiddenInputs?: React.ReactNode;

    leftSidebar?: React.ReactNode;
    rightSidebar?: React.ReactNode;

    canvasBg?: string;
    themeMode?: 'light' | 'dark';
    diagramIdForExport?: string;
    style?: React.CSSProperties;

    canvasArea: React.ReactNode;
    overlays?: React.ReactNode;
    
}

export const UnifiedDesignerShell: React.FC<UnifiedDesignerShellProps> = ({
    id,
    isDragging,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    messageContextHolder,
    notificationContextHolder,
    hiddenInputs,
    leftSidebar,
    rightSidebar,
    canvasBg,
    themeMode = 'light',
    diagramIdForExport,
    style,
    canvasArea,
    overlays,
}) => {
    return (
        <div
            id={`diagram-${id}`}
            className={isDragging ? 'diagram-root diagram-dragging' : 'diagram-root'}
            style={style}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {messageContextHolder}
            {notificationContextHolder}

            {leftSidebar}

            {hiddenInputs}

            <div
                id={`diagram-${diagramIdForExport || id}`}
                className="diagram-canvas-area"
                data-theme={themeMode}
                style={{ backgroundColor: canvasBg }}
            >
                {canvasArea}
            </div>

            {rightSidebar}

            {overlays}
        </div>
    );
};
