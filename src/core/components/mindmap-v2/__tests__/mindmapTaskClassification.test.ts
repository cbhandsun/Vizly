import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import {
    applyTaskClassifications,
    classifyTaskCandidatesLocally,
    collectTaskCandidates,
} from '../mindmapTaskClassification';

describe('mindmapTaskClassification', () => {
    const root: NodeObj = {
        id: 'root',
        topic: '项目',
        children: [
            {
                id: 'phase-1',
                topic: '一期',
                children: [
                    { id: 'task-1', topic: '确认需求', children: [] },
                    { id: 'task-2', topic: '设计原型', children: [] },
                ],
            },
            { id: 'phase-2', topic: '二期', children: [] },
        ],
    };

    it('collects leaf tasks under a selected branch with ancestor context', () => {
        expect(collectTaskCandidates(root, 'phase-1')).toEqual([
            { id: 'task-1', topic: '确认需求', context: '项目 > 一期' },
            { id: 'task-2', topic: '设计原型', context: '项目 > 一期' },
        ]);
    });

    it('applies classifications to matching nodes and syncs tags', () => {
        const mutable = structuredClone(root) as NodeObj;

        const applied = applyTaskClassifications(mutable, [
            { id: 'task-1', status: 'doing', priority: '高' },
            { id: 'missing', status: 'done', priority: '低' },
        ]);

        expect(applied).toBe(1);
        const task = mutable.children?.[0]?.children?.[0] as NodeObj & { task?: unknown };
        expect(task.task).toMatchObject({ status: 'doing', priority: '高' });
        expect(task.tags).toEqual(['进行中', '高']);
    });

    it('classifies task candidates locally with conservative defaults', () => {
        expect(classifyTaskCandidatesLocally([
            { id: 'a', topic: '修复支付故障', context: '核心链路' },
            { id: 'b', topic: '开发中：联调库存接口', context: '一期' },
            { id: 'c', topic: '补充文档', context: '收尾' },
        ])).toEqual([
            { id: 'a', status: 'todo', priority: '高' },
            { id: 'b', status: 'doing', priority: '中' },
            { id: 'c', status: 'todo', priority: '低' },
        ]);
    });
});
