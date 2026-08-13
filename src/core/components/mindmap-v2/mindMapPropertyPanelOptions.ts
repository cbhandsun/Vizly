import type { TagObj } from 'mind-elixir';

import type { TaskPriority, TaskStatus } from './mindmapTaskModel';

type Translate = (key: string) => string;

const PRESET_TAG_DEFINITIONS = [
    { key: 'important', style: { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' } },
    { key: 'todo', style: { background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' } },
    { key: 'done', style: { background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' } },
    { key: 'risk', style: { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' } },
    { key: 'idea', style: { background: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' } },
    { key: 'question', style: { background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' } },
] as const;

const TASK_STATUS_DEFINITIONS: ReadonlyArray<{ key: string; value: TaskStatus }> = [
    { key: 'todo', value: 'todo' },
    { key: 'doing', value: 'doing' },
    { key: 'done', value: 'done' },
];

const TASK_PRIORITY_DEFINITIONS: ReadonlyArray<{ key: string; value: TaskPriority }> = [
    { key: 'none', value: '无' },
    { key: 'low', value: '低' },
    { key: 'medium', value: '中' },
    { key: 'high', value: '高' },
];

export const MIND_MAP_PROPERTY_SHAPES = [
    { key: '', translationKey: 'default', icon: 'default' },
    { key: 'oval', translationKey: 'oval', icon: 'oval' },
    { key: 'rect', translationKey: 'rectangle', icon: 'rect' },
    { key: 'underline', translationKey: 'underline', icon: 'underline' },
    { key: 'diamond', translationKey: 'diamond', icon: 'diamond' },
] as const;

export const MIND_MAP_PROPERTY_SHORTCUTS = [
    { key: 'Tab', translationKey: 'addChild' },
    { key: 'Enter', translationKey: 'addSibling' },
    { key: 'Delete', translationKey: 'deleteNode' },
    { key: 'F2', translationKey: 'edit' },
    { key: 'Ctrl+Z', translationKey: 'undo' },
] as const;

export function createMindMapPropertyPanelOptions(t: Translate): {
    presetTags: TagObj[];
    taskPriorities: Array<{ label: string; value: TaskPriority }>;
    taskStatuses: Array<{ label: string; value: TaskStatus }>;
} {
    return {
        presetTags: PRESET_TAG_DEFINITIONS.map(definition => ({
            text: t(`plugins.mindmap.propertyPanel.presetTags.${definition.key}`),
            style: { ...definition.style },
        })),
        taskPriorities: TASK_PRIORITY_DEFINITIONS.map(definition => ({
            label: t(`plugins.mindmap.propertyPanel.taskPriorities.${definition.key}`),
            value: definition.value,
        })),
        taskStatuses: TASK_STATUS_DEFINITIONS.map(definition => ({
            label: t(`plugins.mindmap.propertyPanel.taskStatuses.${definition.key}`),
            value: definition.value,
        })),
    };
}
