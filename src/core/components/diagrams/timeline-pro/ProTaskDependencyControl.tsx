import React from 'react';
import { LinkOutlined } from '@ant-design/icons';
import { createPortal } from 'react-dom';

interface ProTaskDependencyControlProps {
    active: boolean;
    label: string;
    left: number;
    top: number;
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
    onToggle: () => void;
}

export function ProTaskDependencyControl({
    active,
    label,
    left,
    top,
    onPointerDown,
    onKeyDown,
    onToggle,
}: ProTaskDependencyControlProps) {
    return (
        <button
            type="button"
            className="pro-timeline-task-connect-control"
            style={{ left, top }}
            aria-label={active ? `取消从 ${label} 创建依赖` : `从 ${label} 创建依赖`}
            aria-keyshortcuts="Enter Space ArrowUp ArrowDown Home End Escape"
            aria-pressed={active}
            onClick={(event) => {
                event.stopPropagation();
                if (event.detail === 0) onToggle();
            }}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
        >
            <LinkOutlined aria-hidden="true" />
        </button>
    );
}

export function ProTaskDependencyFeedback({
    announcement,
    active,
}: {
    announcement: string;
    active: boolean;
}) {
    const visibleBanner = active && typeof document !== 'undefined'
        ? createPortal(
            <div className="pro-timeline-connection-banner" aria-hidden="true">{announcement}</div>,
            document.body,
        )
        : null;
    return <>
        <div className="pro-timeline-connection-status" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
        </div>
        {visibleBanner}
    </>;
}
