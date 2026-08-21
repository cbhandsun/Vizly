import type { NodeObj } from 'mind-elixir';
import { describe, expect, it } from 'vitest';

import {
    applyMindMapPropertyTaskDraftPatch,
    createMindMapPropertyTaskDraft,
    syncMindMapPropertyTaskDraftTags,
} from '../mindMapPropertyTaskDraft';

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
});
