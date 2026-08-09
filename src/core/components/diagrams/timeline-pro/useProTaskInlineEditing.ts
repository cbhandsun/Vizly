import { useCallback, useRef, useState } from 'react';

import type { ProGanttTask } from '../../../hooks/useProTimelineEngine';
import type { ProjectedProTimelineTask } from './proTimelineTaskProjection';

interface ProTaskInlineEditingOptions {
    onTaskUpdate?: (taskId: string, updates: Partial<ProGanttTask>) => void;
}

export function useProTaskInlineEditing({ onTaskUpdate }: ProTaskInlineEditingOptions) {
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const cancelledEditTaskIdRef = useRef<string | null>(null);

    const commitEdit = useCallback(() => {
        if (editingTaskId && cancelledEditTaskIdRef.current !== editingTaskId && editingText.trim()) {
            onTaskUpdate?.(editingTaskId, { name: editingText.trim() });
        }
        if (cancelledEditTaskIdRef.current === editingTaskId) cancelledEditTaskIdRef.current = null;
        setEditingTaskId(null);
    }, [editingTaskId, editingText, onTaskUpdate]);

    const startTaskNameEdit = useCallback((task: ProjectedProTimelineTask) => {
        cancelledEditTaskIdRef.current = null;
        setEditingTaskId(task.id);
        setEditingText(task.name);
    }, []);

    const cancelTaskNameEdit = useCallback(() => {
        cancelledEditTaskIdRef.current = editingTaskId;
        setEditingTaskId(null);
    }, [editingTaskId]);

    return {
        cancelTaskNameEdit,
        commitEdit,
        editingTaskId,
        editingText,
        setEditingText,
        startTaskNameEdit,
    };
}
