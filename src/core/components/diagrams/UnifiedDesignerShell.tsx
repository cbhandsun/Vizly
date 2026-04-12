import React from 'react';

export interface UnifiedDesignerShellProps {
    id: string;
    isDragging?: boolean;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;

    messageContextHolder?: React.ReactNode;
    notificationContextHolder?: React.ReactNode;

    hiddenInputs?: React.ReactNode;

    leftSidebar?: React.ReactNode;
    rightSidebar?: React.ReactNode;

    canvasBg?: string;
    themeMode?: 'light' | 'dark';
    diagramIdForExport?: string;

    canvasArea: React.ReactNode;
    overlays?: React.ReactNode;
    
}

export const UnifiedDesignerShell: React.FC<UnifiedDesignerShellProps> = ({
    id,
    isDragging,
    onDragOver,
    onDrop,
    messageContextHolder,
    notificationContextHolder,
    hiddenInputs,
    leftSidebar,
    rightSidebar,
    canvasBg,
    themeMode = 'light',
    diagramIdForExport,
    canvasArea,
    overlays,
}) => {
    return (
        <div
            id={`diagram-${id}`}
            className={isDragging ? 'diagram-root diagram-dragging' : 'diagram-root'}
            onDragOver={onDragOver}
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
