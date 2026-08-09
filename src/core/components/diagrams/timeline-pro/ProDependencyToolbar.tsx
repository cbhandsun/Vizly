import React, { useMemo, useState } from 'react';
import { CheckOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ProGanttTask } from '../../../hooks/useProTimelineEngine';
import { getProTimelineDependencyAccessibleName, getProTimelineDependencyTaskName } from './proTimelineDependencyInteraction';

interface ProDependencyToolbarProps {
    sourceId: string;
    targetId: string;
    tasks: readonly ProGanttTask[];
    left: number;
    top: number;
    onApply: (sourceId: string, targetId: string) => void;
    onClose: () => void;
    onDelete: () => void;
}

export function ProDependencyToolbar({
    sourceId,
    targetId,
    tasks,
    left,
    top,
    onApply,
    onClose,
    onDelete,
}: ProDependencyToolbarProps) {
    const options = useMemo(
        () => tasks.filter((task) => (
            task._computed?.isVisible !== false
            && (task.type !== 'summary' || task.id === sourceId || task.id === targetId)
        )),
        [sourceId, targetId, tasks],
    );
    const [draftSourceId, setDraftSourceId] = useState(sourceId);
    const [draftTargetId, setDraftTargetId] = useState(targetId);
    const taskName = (taskId: string) => getProTimelineDependencyTaskName(
        options.find((task) => task.id === taskId)?.name,
    );
    const dependencyName = getProTimelineDependencyAccessibleName(taskName(sourceId), taskName(targetId));
    const hasChanges = draftSourceId !== sourceId || draftTargetId !== targetId;
    const selectKnownTask = (
        value: string,
        setter: React.Dispatch<React.SetStateAction<string>>,
    ) => {
        if (options.some((task) => task.id === value)) setter(value);
    };

    return (
        <div
            className="pro-dependency-toolbar"
            role="group"
            aria-label={`编辑${dependencyName}`}
            style={{ left, top }}
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                onClose();
            }}
        >
            <div className="pro-dependency-toolbar__header">
                <strong>{dependencyName}</strong>
                <button type="button" aria-label="关闭依赖编辑" onClick={onClose}>
                    <CloseOutlined aria-hidden />
                </button>
            </div>
            <div className="pro-dependency-toolbar__fields">
                <label>
                    <span>前置任务</span>
                    <select
                        aria-label="前置任务"
                        value={draftSourceId}
                        onChange={(event) => selectKnownTask(event.target.value, setDraftSourceId)}
                    >
                        {options.map((task) => (
                            <option key={task.id} value={task.id}>{getProTimelineDependencyTaskName(task.name)}</option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>后置任务</span>
                    <select
                        aria-label="后置任务"
                        value={draftTargetId}
                        onChange={(event) => selectKnownTask(event.target.value, setDraftTargetId)}
                    >
                        {options.map((task) => (
                            <option key={task.id} value={task.id}>{getProTimelineDependencyTaskName(task.name)}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="pro-dependency-toolbar__actions">
                <button
                    type="button"
                    className="pro-dependency-toolbar__apply"
                    disabled={!hasChanges}
                    onClick={() => onApply(draftSourceId, draftTargetId)}
                >
                    <CheckOutlined aria-hidden />
                    应用更改
                </button>
                <button
                    type="button"
                    className="pro-dependency-toolbar__delete"
                    aria-label={`删除${dependencyName}`}
                    onClick={onDelete}
                >
                    <DeleteOutlined aria-hidden />
                    删除依赖
                </button>
            </div>
            <div className="pro-dependency-toolbar__hint">Delete 删除 · Escape 关闭 · 删除和更改均可撤销</div>
        </div>
    );
}
