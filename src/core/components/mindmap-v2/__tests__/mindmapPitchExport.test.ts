import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { nodeObjToPitchMarkdown } from '../mindmapPitchExport';

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
});
