import type { TagObj } from 'mind-elixir';
import type { TaskPriority, TaskStatus } from './mindmapTaskModel';

export const PRESET_TAGS: TagObj[] = [
    { text: '重要', style: { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' } },
    { text: '待办', style: { background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' } },
    { text: '完成', style: { background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' } },
    { text: '风险', style: { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' } },
    { text: '想法', style: { background: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' } },
    { text: '问题', style: { background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' } },
];

export const TASK_STATUS_OPTIONS: Array<{ label: string; value: TaskStatus }> = [
    { label: '待办', value: 'todo' },
    { label: '进行中', value: 'doing' },
    { label: '已完成', value: 'done' },
];

export const TASK_PRIORITY_OPTIONS: Array<{ label: string; value: TaskPriority }> = [
    { label: '无', value: '无' },
    { label: '低', value: '低' },
    { label: '中', value: '中' },
    { label: '高', value: '高' },
];
