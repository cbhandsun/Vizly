import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { nodeObjToMarkdown, nodeObjToOpml, opmlToNodeObj } from '../migrate';

describe('nodeObjToMarkdown', () => {
    it('exports task metadata only for task-aware nodes', () => {
        const root: NodeObj = {
            id: 'root',
            topic: '项目计划',
            children: [
                {
                    id: 'plain',
                    topic: '普通节点',
                    children: [],
                },
                {
                    id: 'task',
                    topic: '交付首版',
                    children: [],
                    ...( {
                        task: {
                            status: 'doing',
                            priority: '高',
                            assignee: 'Alex',
                            dueDate: '2026-06-20',
                            progress: 60,
                        },
                    } as any),
                },
            ],
        };

        const markdown = nodeObjToMarkdown(root);

        expect(markdown).toContain('- 普通节点');
        expect(markdown).toContain('- 交付首版');
        expect(markdown).toContain('任务: 状态: 进行中 | 优先级: 高 | 负责人: Alex | 截止: 2026-06-20 | 进度: 60%');
        expect(markdown).not.toMatch(/普通节点\n\s+> 任务:/);
    });

    it('round-trips task metadata through OPML', () => {
        const root: NodeObj = {
            id: 'root',
            topic: '项目计划',
            children: [
                {
                    id: 'task',
                    topic: '交付首版',
                    note: '需要跨团队协同',
                    children: [],
                    ...( {
                        task: {
                            status: 'doing',
                            priority: '高',
                            assignee: 'Alex & Lee',
                            dueDate: '2026-06-20',
                            progress: 60,
                        },
                    } as any),
                },
            ],
        };

        const opml = nodeObjToOpml(root);
        expect(opml).toContain('_vizly_task_status="doing"');
        expect(opml).toContain('_vizly_task_priority="高"');
        expect(opml).toContain('_vizly_task_assignee="Alex &amp; Lee"');

        const imported = opmlToNodeObj(opml) as NodeObj & {
            children?: Array<NodeObj & { task?: unknown }>;
        };
        const task = imported.children?.[0];
        expect(task?.note).toBe('需要跨团队协同');
        expect(task?.task).toMatchObject({
            status: 'doing',
            priority: '高',
            assignee: 'Alex & Lee',
            dueDate: '2026-06-20',
            progress: 60,
        });
        expect(task?.tags).toEqual(['进行中', '高']);
    });
});
