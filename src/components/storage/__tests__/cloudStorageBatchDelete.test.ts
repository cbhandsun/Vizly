import { describe, expect, it, vi } from 'vitest';

import { runCloudStorageBatchDelete } from '../cloudStorageBatchDelete';

describe('runCloudStorageBatchDelete', () => {
    it('separates successful and failed deletions so failed items remain retryable', async () => {
        const failure = new Error('delete unavailable');
        const onDeleteFailure = vi.fn();
        const deleteDiagram = vi.fn(async (id: string) => {
            if (id === 'diagram-2') throw failure;
        });

        const result = await runCloudStorageBatchDelete({
            ids: ['diagram-1', 'diagram-2', 'diagram-3'],
            deleteDiagram,
            onDeleteFailure,
        });

        expect(result).toEqual({
            succeededIds: ['diagram-1', 'diagram-3'],
            failedIds: ['diagram-2'],
        });
        expect(onDeleteFailure).toHaveBeenCalledWith('diagram-2', failure);
    });

    it('normalizes empty and duplicate external identifiers before deletion', async () => {
        const deleteDiagram = vi.fn().mockResolvedValue(undefined);

        const result = await runCloudStorageBatchDelete({
            ids: ['', ' diagram-1 ', 'diagram-1', '   ', 'diagram-2'],
            deleteDiagram,
        });

        expect(deleteDiagram.mock.calls).toEqual([['diagram-1'], ['diagram-2']]);
        expect(result).toEqual({
            succeededIds: ['diagram-1', 'diagram-2'],
            failedIds: [],
        });
    });

    it('bounds concurrency and completes later chunks after an earlier failure', async () => {
        let active = 0;
        let maxActive = 0;
        const deleteDiagram = vi.fn(async (id: string) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await Promise.resolve();
            active -= 1;
            if (id === 'diagram-1') throw new Error('first failed');
        });

        const result = await runCloudStorageBatchDelete({
            ids: ['diagram-1', 'diagram-2', 'diagram-3', 'diagram-4'],
            deleteDiagram,
            concurrency: 2,
        });

        expect(maxActive).toBe(2);
        expect(deleteDiagram).toHaveBeenCalledTimes(4);
        expect(result.failedIds).toEqual(['diagram-1']);
        expect(result.succeededIds).toEqual(['diagram-2', 'diagram-3', 'diagram-4']);
    });

    it('returns an empty result without invoking the provider for empty input', async () => {
        const deleteDiagram = vi.fn().mockResolvedValue(undefined);

        await expect(runCloudStorageBatchDelete({ ids: [], deleteDiagram })).resolves.toEqual({
            succeededIds: [],
            failedIds: [],
        });
        expect(deleteDiagram).not.toHaveBeenCalled();
    });
});
