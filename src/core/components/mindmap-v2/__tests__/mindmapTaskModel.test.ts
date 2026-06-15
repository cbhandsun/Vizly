import { describe, expect, it } from 'vitest';
import type { NodeObj, TagObj } from 'mind-elixir';
import {
    applyTaskMeta,
    getTaskMeta,
    mergeTaskTags,
    MINDMAP_TASK_ASSIGNEE_MAX_LENGTH,
    normalizeTags,
} from '../mindmapTaskModel';
import { MINDMAP_MAX_TAGS, MINDMAP_MAX_TAG_LENGTH } from '../mindmapTreeSanitizer';

describe('mindmapTaskModel', () => {
    it('normalizes string and object tags', () => {
        const tags: Array<string | TagObj> = [
            '待办',
            { text: '高', style: { color: '#fff' } },
            { text: '' },
        ];

        expect(normalizeTags(tags)).toEqual(['待办', '高']);
    });

    it('bounds normalized tags from stale task metadata', () => {
        const tags = Array.from({ length: MINDMAP_MAX_TAGS + 10 }, (_, index) => ({
            text: `tag-${index}-` + 'x'.repeat(MINDMAP_MAX_TAG_LENGTH),
        })) as TagObj[];

        const normalized = normalizeTags(tags);

        expect(normalized).toHaveLength(MINDMAP_MAX_TAGS);
        expect(normalized[0]).toHaveLength(MINDMAP_MAX_TAG_LENGTH);
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

    it('sanitizes task metadata from manual, AI, and import writes', () => {
        const node = {
            id: 'n2',
            topic: '节点',
            tags: ['done', '高'],
            task: {
                status: 'invalid',
                priority: 'invalid',
                assignee: 'A'.repeat(MINDMAP_TASK_ASSIGNEE_MAX_LENGTH + 20),
                dueDate: 'not-a-date<script>',
                progress: Number.POSITIVE_INFINITY,
            },
            children: [],
        } as NodeObj & any;

        const meta = getTaskMeta(node);

        expect(meta.status).toBe('done');
        expect(meta.priority).toBe('高');
        expect(meta.assignee).toHaveLength(MINDMAP_TASK_ASSIGNEE_MAX_LENGTH);
        expect(meta.dueDate).toBe('');
        expect(meta.progress).toBe(0);

        const applied = applyTaskMeta(node, {
            status: 'bad' as any,
            priority: 'bad' as any,
            assignee: 'B'.repeat(MINDMAP_TASK_ASSIGNEE_MAX_LENGTH + 20),
            dueDate: '2026-06-15T00:00:00Z',
            progress: 999,
        });

        expect(applied.status).toBe('done');
        expect(applied.priority).toBe('高');
        expect(applied.assignee).toHaveLength(MINDMAP_TASK_ASSIGNEE_MAX_LENGTH);
        expect(applied.dueDate).toBe('');
        expect(applied.progress).toBe(100);
    });
});
