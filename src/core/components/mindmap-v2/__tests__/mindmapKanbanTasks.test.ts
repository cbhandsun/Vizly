import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { extractKanbanTasks } from '../mindmapKanbanTasks';
import type { MindMapTaskMeta } from '../mindmapTaskModel';

describe('extractKanbanTasks', () => {
    it('extracts leaves with their ancestor path', () => {
        const tree = {
            id: 'root',
            topic: '项目',
            children: [{
                id: 'group',
                topic: '研发',
                children: [{
                    id: 'leaf',
                    topic: '发布版本',
                    children: [],
                }],
            }],
        } as NodeObj;

        expect(extractKanbanTasks(tree)).toEqual([
            expect.objectContaining({
                id: 'leaf',
                topic: '发布版本',
                ancestors: ['项目', '研发'],
            }),
        ]);
    });

    it('keeps an explicitly annotated parent as a task without duplicating descendants', () => {
        const milestone: NodeObj & { task: MindMapTaskMeta } = {
            id: 'milestone',
            topic: '里程碑',
            task: { status: 'doing', priority: '高' },
            children: [{
                id: 'leaf',
                topic: '子任务',
                children: [],
            }],
        };
        const tree = {
            id: 'root',
            topic: '项目',
            children: [milestone],
        } as NodeObj;

        expect(extractKanbanTasks(tree)).toEqual([
            expect.objectContaining({
                id: 'milestone',
                status: 'doing',
                priority: '高',
                ancestors: ['项目'],
            }),
        ]);
    });

    it('returns the root as a task when the tree has no children', () => {
        const root = { id: 'root', topic: '', children: [] } as NodeObj;

        expect(extractKanbanTasks(root)).toEqual([
            expect.objectContaining({
                id: 'root',
                topic: '(无标题)',
                ancestors: [],
            }),
        ]);
    });
});
