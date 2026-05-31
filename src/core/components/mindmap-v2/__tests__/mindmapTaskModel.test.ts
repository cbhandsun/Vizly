import { describe, expect, it } from 'vitest';
import type { NodeObj, TagObj } from 'mind-elixir';
import { applyTaskMeta, getTaskMeta, mergeTaskTags, normalizeTags } from '../mindmapTaskModel';

describe('mindmapTaskModel', () => {
    it('normalizes string and object tags', () => {
        const tags: Array<string | TagObj> = [
            '待办',
            { text: '高', style: { color: '#fff' } },
            { text: '' },
        ];

        expect(normalizeTags(tags)).toEqual(['待办', '高']);
    });

    it('prefers task metadata over legacy tags and clamps progress', () => {
        const node = {
            id: 'task',
            topic: '任务',
            tags: ['已完成', '高'],
            task: {
                status: 'doing',
                priority: '低',
                assignee: 'Dana',
                dueDate: '2026-06-01',
                progress: 140,
            },
        } as NodeObj & any;

        expect(getTaskMeta(node)).toEqual({
            status: 'doing',
            priority: '低',
            assignee: 'Dana',
            dueDate: '2026-06-01',
            progress: 100,
        });
    });

    it('merges task tags while preserving unrelated tags', () => {
        expect(mergeTaskTags(['风险', '待办', '高', '风险'], 'done', '中')).toEqual([
            '风险',
            '已完成',
            '中',
        ]);
    });

    it('applies task metadata and keeps tags synchronized', () => {
        const node: NodeObj = {
            id: 'n1',
            topic: '节点',
            tags: ['想法', 'todo'],
            children: [],
        };

        const task = applyTaskMeta(node, {
            status: 'doing',
            priority: '高',
            assignee: 'Lee',
            progress: 35,
        });

        expect(task).toMatchObject({
            status: 'doing',
            priority: '高',
            assignee: 'Lee',
            progress: 35,
        });
        expect((node as any).task).toEqual(task);
        expect(node.tags).toEqual(['想法', '进行中', '高']);
    });
});
