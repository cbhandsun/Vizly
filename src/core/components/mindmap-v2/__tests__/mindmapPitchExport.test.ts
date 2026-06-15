import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { nodeObjToPitchMarkdown } from '../mindmapPitchExport';
import {
    MINDMAP_MAX_CHILDREN_PER_NODE,
    MINDMAP_MAX_NOTE_LENGTH,
    MINDMAP_MAX_TOPIC_LENGTH,
} from '../mindmapTreeSanitizer';

describe('nodeObjToPitchMarkdown', () => {
    it('exports presentation slides with notes and task metadata', () => {
        const root: NodeObj = {
            id: 'root',
            topic: '产品规划',
            children: [
                {
                    id: 'strategy',
                    topic: '战略目标',
                    note: '强调年度主线。',
                    children: [],
                    ...( {
                        task: {
                            status: 'doing',
                            priority: '高',
                            assignee: 'Alex',
                            dueDate: '2026-06-15',
                            progress: 40,
                        },
                    } as any),
                },
                {
                    id: 'hidden',
                    topic: '折叠分支',
                    expanded: false,
                    children: [
                        { id: 'hidden-child', topic: '不会导出', children: [] },
                    ],
                },
            ],
        };

        const markdown = nodeObjToPitchMarkdown(root);

        expect(markdown).toContain('# 产品规划');
        expect(markdown).toContain('1. 产品规划');
        expect(markdown).toContain('2. 战略目标');
        expect(markdown).toContain('备注:');
        expect(markdown).toContain('强调年度主线。');
        expect(markdown).toContain('任务: 状态: 进行中 | 优先级: 高 | 负责人: Alex | 截止: 2026-06-15 | 进度: 40%');
        expect(markdown).toContain('3. 折叠分支');
        expect(markdown).not.toContain('不会导出');
    });

    it('bounds exported text and child fan-out for stale unsafe trees', () => {
        const root: NodeObj = {
            id: 'root',
            topic: 't'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 20),
            note: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 20),
            children: Array.from({ length: MINDMAP_MAX_CHILDREN_PER_NODE + 10 }, (_, index) => ({
                id: `child-${index}`,
                topic: `child-${index}`,
                children: [],
            })),
        };

        const markdown = nodeObjToPitchMarkdown(root);

        expect(markdown).toContain('# ' + 't'.repeat(MINDMAP_MAX_TOPIC_LENGTH));
        expect(markdown).not.toContain('n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 1));
        expect(markdown).toContain(`${MINDMAP_MAX_CHILDREN_PER_NODE + 1}. child-${MINDMAP_MAX_CHILDREN_PER_NODE - 1}`);
        expect(markdown).not.toContain(`child-${MINDMAP_MAX_CHILDREN_PER_NODE}`);
    });
});
