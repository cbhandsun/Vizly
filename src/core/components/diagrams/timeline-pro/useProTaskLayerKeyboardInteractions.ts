import { useCallback } from 'react';
import type React from 'react';

import {
    addWorkDaysSigned,
    getWorkDays,
    type ProGanttTask,
} from '../../../hooks/useProTimelineEngine';
import { parseDateOnlyTime } from '../../../utils/dateOnly';
import type { ProjectedProTimelineTask } from './proTimelineTaskProjection';
import {
    getProTaskDateKeyboardDelta,
    getProTaskProgressKeyboardValue,
} from './proTaskLayerInteraction';

interface ProTaskLayerKeyboardOptions {
    cancelDragInteraction: () => void;
    handleTaskConnectionKeyDown?: (
        event: React.KeyboardEvent<HTMLElement>,
        task: ProjectedProTimelineTask,
    ) => boolean;
    onTaskClick?: (taskId: string) => void;
    onTaskDragEnd?: (taskId: string, newStartDate: string, newEndDate: string) => void;
    onTaskUpdate?: (taskId: string, updates: Partial<ProGanttTask>) => void;
    startTaskNameEdit: (task: ProjectedProTimelineTask) => void;
}

export function useProTaskLayerKeyboardInteractions({
    cancelDragInteraction,
    handleTaskConnectionKeyDown,
    onTaskClick,
    onTaskDragEnd,
    onTaskUpdate,
    startTaskNameEdit,
}: ProTaskLayerKeyboardOptions) {
    const handleTaskBarKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, task: ProjectedProTimelineTask) => {
        if (event.target !== event.currentTarget) return;
        if (handleTaskConnectionKeyDown?.(event, task)) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onTaskClick?.(task.id);
            return;
        }
        if (event.key === 'F2') {
            event.preventDefault();
            startTaskNameEdit(task);
            return;
        }
        if (event.key === 'Escape') {
            cancelDragInteraction();
            return;
        }
        if (task.type === 'summary' || parseDateOnlyTime(task.startDate) === null || parseDateOnlyTime(task.endDate) === null) return;
        const delta = getProTaskDateKeyboardDelta(event.key, event.shiftKey);
        if (delta === null) return;
        event.preventDefault();
        onTaskDragEnd?.(task.id, addWorkDaysSigned(task.startDate, delta), addWorkDaysSigned(task.endDate, delta));
    }, [cancelDragInteraction, handleTaskConnectionKeyDown, onTaskClick, onTaskDragEnd, startTaskNameEdit]);

    const handleProgressKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, task: ProjectedProTimelineTask) => {
        const progress = getProTaskProgressKeyboardValue(task.progress, event.key, event.shiftKey);
        if (progress === null) return;
        event.preventDefault();
        event.stopPropagation();
        onTaskUpdate?.(task.id, { progress });
    }, [onTaskUpdate]);

    const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, task: ProjectedProTimelineTask) => {
        const delta = getProTaskDateKeyboardDelta(event.key, event.shiftKey);
        if (delta === null || parseDateOnlyTime(task.startDate) === null || parseDateOnlyTime(task.endDate) === null) return;
        event.preventDefault();
        event.stopPropagation();
        const currentDuration = Math.max(1, getWorkDays(task.startDate, task.endDate));
        const nextDuration = Math.max(1, currentDuration + delta);
        onTaskDragEnd?.(task.id, task.startDate, addWorkDaysSigned(task.startDate, nextDuration - 1));
    }, [onTaskDragEnd]);

    return { handleTaskBarKeyDown, handleProgressKeyDown, handleResizeKeyDown };
}
