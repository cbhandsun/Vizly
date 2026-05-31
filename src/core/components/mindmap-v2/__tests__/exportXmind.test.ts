import { describe, expect, it } from 'vitest';
import type { NodeObj, TagObj } from 'mind-elixir';
import { nodeToXmindTopic } from '../exportXmind';

describe('nodeToXmindTopic', () => {
    it('exports tag text and task metadata into XMind-compatible fields', () => {
        const node = {
            id: 'task-node',
            topic: '交付计划',
            note: '需要跨团队确认。',
            tags: ['风险', { text: '高', style: { color: '#fff' } } as TagObj],
            task: {
                status: 'doing',
                priority: '高',
                assignee: 'Mia',
                dueDate: '2026-06-20',
                progress: 55,
            },
            children: [],
        } as NodeObj & any;

        const topic = nodeToXmindTopic(node, 1);

        expect(topic.labels).toEqual(['风险', '高']);
        expect(topic.notes?.plain.content).toContain('需要跨团队确认。');
        expect(topic.notes?.plain.content).toContain('任务:');
        expect(topic.notes?.plain.content).toContain('状态: 进行中');
        expect(topic.notes?.plain.content).toContain('负责人: Mia');
        expect(topic.notes?.plain.content).toContain('进度: 55%');
    });
});
