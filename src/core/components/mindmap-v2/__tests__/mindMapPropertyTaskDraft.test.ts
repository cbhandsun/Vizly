import type { NodeObj } from 'mind-elixir';
import { describe, expect, it } from 'vitest';

import {
    applyMindMapPropertyTaskDraftPatch,
    beginMindMapPropertyTagsTransaction,
    beginMindMapPropertyTaskPatchTransaction,
    createMindMapPropertyTaskDraft,
    createMindMapPropertyTaskTransactionState,
    settleMindMapPropertyTaskTransaction,
    syncMindMapPropertyTaskDraftTags,
} from '../mindMapPropertyTaskDraft';
import { getTaskMeta } from '../mindmapTaskModel';

const node = (): NodeObj => ({
    id: 'task-1',
    topic: 'Ship release',
    tags: [{ text: 'Customer' }],
});

describe('mind map property task draft', () => {
    it('preserves rapid edits even when the source node has not rerendered', () => {
        const first = applyMindMapPropertyTaskDraftPatch(
            createMindMapPropertyTaskDraft(node()),
            { status: 'doing' },
        );
        const second = applyMindMapPropertyTaskDraftPatch(first.draft, { priority: '高' });
        const third = applyMindMapPropertyTaskDraftPatch(second.draft, {
            assignee: ' Alice ',
            progress: 150,
        });

        expect(third.meta).toMatchObject({
            status: 'doing',
            priority: '高',
            assignee: 'Alice',
            progress: 100,
        });
        expect(third.mutation.tags).toEqual([
            'Customer',
            '进行中',
            '高',
        ]);
    });

    it('keeps custom tag changes in the next task mutation', () => {
        const draft = syncMindMapPropertyTaskDraftTags(
            createMindMapPropertyTaskDraft(node()),
            [{ text: 'Risk' }],
        );
        const result = applyMindMapPropertyTaskDraftPatch(draft, { status: 'done' });

        expect(result.mutation.tags).toEqual([
            'Risk',
            '已完成',
        ]);
    });

    it('rolls the optimistic task draft back when the only mutation fails', () => {
        const initial = createMindMapPropertyTaskTransactionState(node());
        const started = beginMindMapPropertyTaskPatchTransaction(initial, { status: 'doing' });
        const settled = settleMindMapPropertyTaskTransaction(
            started.state,
            started.entry?.sequence ?? -1,
            false,
            'Save failed',
        );

        expect(getTaskMeta(started.state.optimisticDraft).status).toBe('doing');
        expect(getTaskMeta(settled.optimisticDraft).status).toBe('todo');
        expect(settled.pendingEntries).toEqual([]);
        expect(settled.error).toBe('Save failed');
    });

    it('keeps the newest confirmed snapshot when a later mutation fails', () => {
        const initial = createMindMapPropertyTaskTransactionState(node());
        const status = beginMindMapPropertyTaskPatchTransaction(initial, { status: 'doing' });
        const priority = beginMindMapPropertyTaskPatchTransaction(status.state, { priority: '高' });
        const statusSettled = settleMindMapPropertyTaskTransaction(
            priority.state,
            status.entry?.sequence ?? -1,
            true,
            'Save failed',
        );
        const prioritySettled = settleMindMapPropertyTaskTransaction(
            statusSettled,
            priority.entry?.sequence ?? -1,
            false,
            'Save failed',
        );

        expect(getTaskMeta(prioritySettled.optimisticDraft)).toMatchObject({
            priority: '无',
            status: 'doing',
        });
        expect(prioritySettled.error).toBe('Save failed');
    });

    it('uses sequence order when a later success settles before an earlier failure', () => {
        const initial = createMindMapPropertyTaskTransactionState(node());
        const status = beginMindMapPropertyTaskPatchTransaction(initial, { status: 'doing' });
        const priority = beginMindMapPropertyTaskPatchTransaction(status.state, { priority: '高' });
        const laterSettledFirst = settleMindMapPropertyTaskTransaction(
            priority.state,
            priority.entry?.sequence ?? -1,
            true,
            'Save failed',
        );
        const earlierSettledLast = settleMindMapPropertyTaskTransaction(
            laterSettledFirst,
            status.entry?.sequence ?? -1,
            false,
            'Save failed',
        );

        expect(getTaskMeta(earlierSettledLast.optimisticDraft)).toMatchObject({
            priority: '高',
            status: 'doing',
        });
        expect(earlierSettledLast.error).toBe('');
    });

    it('carries rapid tag and task intentions in the same complete snapshot', () => {
        const initial = createMindMapPropertyTaskTransactionState(node());
        const tags = beginMindMapPropertyTagsTransaction(initial, [{ text: 'Risk' }]);
        const task = beginMindMapPropertyTaskPatchTransaction(tags.state, { status: 'done' });

        expect(task.entry?.mutation.tags).toEqual(['Risk', '已完成']);
        expect(task.entry?.mutation.task).toMatchObject({ status: 'done' });
    });

    it('deduplicates unchanged task and tag intentions while clearing stale errors', () => {
        const initial = {
            ...createMindMapPropertyTaskTransactionState(node()),
            error: 'Save failed',
        };
        const sameTask = beginMindMapPropertyTaskPatchTransaction(initial, { status: 'todo' });
        const sameTags = beginMindMapPropertyTagsTransaction(sameTask.state, [{ text: 'Customer' }]);

        expect(sameTask.entry).toBeUndefined();
        expect(sameTags.entry).toBeUndefined();
        expect(sameTags.state.error).toBe('');
        expect(sameTags.state.nextSequence).toBe(1);
    });
});
