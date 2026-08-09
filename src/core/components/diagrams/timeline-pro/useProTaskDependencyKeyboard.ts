import { useCallback, useMemo, useState } from 'react';
import type React from 'react';

import type { ProjectedProTimelineTask } from './proTimelineTaskProjection';
import type { ProTimelineDependencyConnectionResult } from './proTimelineDependencyConnection';
import { getProTaskLayerAccessibleName } from './proTaskLayerInteraction';

interface ProTaskDependencyKeyboardOptions {
    tasks: ProjectedProTimelineTask[];
    onTaskConnect?: (
        sourceId: string,
        targetId: string,
    ) => ProTimelineDependencyConnectionResult | void;
}

interface TaskDependencyState {
    sourceTaskId: string;
    targetTaskId: string;
}

const isConnectableTask = (task: ProjectedProTimelineTask) => (
    task.type !== 'summary' && Boolean(task._computed?.isVisible)
);

export function useProTaskDependencyKeyboard({
    tasks,
    onTaskConnect,
}: ProTaskDependencyKeyboardOptions) {
    const [connectionState, setConnectionState] = useState<TaskDependencyState | null>(null);
    const [connectionAnnouncement, setConnectionAnnouncement] = useState('');
    const connectableTasks = useMemo(() => tasks.filter(isConnectableTask), [tasks]);

    const taskName = useCallback((taskId: string) => getProTaskLayerAccessibleName(
        tasks.find((task) => task.id === taskId)?.name,
    ), [tasks]);

    const startConnection = useCallback((sourceTaskId: string) => {
        if (!onTaskConnect) {
            setConnectionAnnouncement('当前视图未启用依赖关系编辑。');
            return false;
        }
        const sourceIndex = connectableTasks.findIndex((task) => task.id === sourceTaskId);
        if (sourceIndex < 0) {
            setConnectionAnnouncement('此任务不能创建依赖关系。');
            return false;
        }
        if (connectableTasks.length < 2) {
            setConnectionAnnouncement('没有其他可见任务可作为依赖目标。');
            return false;
        }
        const target = connectableTasks[(sourceIndex + 1) % connectableTasks.length];
        setConnectionState({ sourceTaskId, targetTaskId: target.id });
        setConnectionAnnouncement(
            `已选择前置任务 ${taskName(sourceTaskId)}。当前后置任务 ${taskName(target.id)}。使用上下方向键选择，Enter 确认，Escape 取消。`,
        );
        return true;
    }, [connectableTasks, onTaskConnect, taskName]);

    const cancelConnection = useCallback(() => {
        if (!connectionState) return false;
        setConnectionState(null);
        setConnectionAnnouncement('已取消创建依赖关系。');
        return true;
    }, [connectionState]);

    const moveTarget = useCallback((direction: 'next' | 'previous' | 'first' | 'last') => {
        if (!connectionState) return false;
        const candidates = connectableTasks.filter((task) => task.id !== connectionState.sourceTaskId);
        if (candidates.length === 0) return false;
        const currentIndex = Math.max(0, candidates.findIndex((task) => task.id === connectionState.targetTaskId));
        let nextIndex: number;
        switch (direction) {
            case 'first': nextIndex = 0; break;
            case 'last': nextIndex = candidates.length - 1; break;
            case 'next': nextIndex = (currentIndex + 1) % candidates.length; break;
            case 'previous': nextIndex = (currentIndex - 1 + candidates.length) % candidates.length; break;
        }
        const target = candidates[nextIndex];
        setConnectionState((current) => current ? { ...current, targetTaskId: target.id } : null);
        setConnectionAnnouncement(`当前后置任务 ${taskName(target.id)}。Enter 确认，Escape 取消。`);
        return true;
    }, [connectableTasks, connectionState, taskName]);

    const connectTasks = useCallback((sourceTaskId: string, targetTaskId: string) => {
        const result = onTaskConnect?.(sourceTaskId, targetTaskId);
        if (result && !result.ok) {
            setConnectionAnnouncement(connectionState
                ? `${result.message} 请选择其他任务，或按 Escape 取消。`
                : `${result.message} 可重新选择源任务和目标任务后再试。`);
            return true;
        }
        setConnectionAnnouncement(
            `已创建从 ${taskName(sourceTaskId)} 到 ${taskName(targetTaskId)} 的依赖关系。`,
        );
        setConnectionState(null);
        return true;
    }, [connectionState, onTaskConnect, taskName]);

    const completeConnection = useCallback(() => {
        if (!connectionState) return false;
        return connectTasks(connectionState.sourceTaskId, connectionState.targetTaskId);
    }, [connectTasks, connectionState]);

    const handleTaskConnectionKeyDown = useCallback((
        event: React.KeyboardEvent<HTMLElement>,
        task: ProjectedProTimelineTask,
    ) => {
        if (!connectionState) {
            if (event.key.toLowerCase() !== 'c') return false;
            event.preventDefault();
            return startConnection(task.id);
        }
        if (connectionState.sourceTaskId !== task.id) return false;
        const action = event.key === 'ArrowDown'
            ? () => moveTarget('next')
            : event.key === 'ArrowUp'
                ? () => moveTarget('previous')
                : event.key === 'Home'
                    ? () => moveTarget('first')
                    : event.key === 'End'
                        ? () => moveTarget('last')
                        : event.key === 'Enter'
                            ? completeConnection
                            : event.key === 'Escape'
                                ? cancelConnection
                                : null;
        if (!action) return false;
        event.preventDefault();
        action();
        return true;
    }, [cancelConnection, completeConnection, connectionState, moveTarget, startConnection]);

    const toggleConnection = useCallback((taskId: string) => {
        if (connectionState?.sourceTaskId === taskId) return cancelConnection();
        return startConnection(taskId);
    }, [cancelConnection, connectionState?.sourceTaskId, startConnection]);

    return {
        connectionAnnouncement,
        connectionState,
        connectTasks,
        completeConnection,
        handleTaskConnectionKeyDown,
        isConnectableTask: (task: ProjectedProTimelineTask) => Boolean(onTaskConnect) && isConnectableTask(task),
        moveTarget,
        toggleConnection,
    };
}
