import { describe, expect, it, vi } from 'vitest';

import {
    executeConfirmedLocalEditorReset,
    resetLocalEditorState,
    resolveLocalEditorResetDiagramId,
} from '../localEditorReset';

const storage = (value: string | null): Pick<Storage, 'getItem'> => ({
    getItem: vi.fn(() => value),
});

describe('localEditorReset', () => {
    it('prefers a bounded URL diagram id over persisted selection', () => {
        expect(resolveLocalEditorResetDiagramId(
            { search: '?diagram=%20diagram-url%20', hash: '' },
            storage('diagram-stored'),
        )).toBe('diagram-url');
    });

    it('coerces the persisted external value before using it', () => {
        expect(resolveLocalEditorResetDiagramId(
            { search: '', hash: '#/' },
            storage('  diagram with spaces  '),
        )).toBe('diagram-with-spaces');
    });

    it('fails closed when persisted storage cannot be read', () => {
        expect(resolveLocalEditorResetDiagramId(
            { search: '', hash: '#/' },
            { getItem: () => { throw new Error('blocked'); } },
        )).toBeNull();
    });

    it('does not clear generic state when a diagram id is unavailable', () => {
        const clearCache = vi.fn();

        expect(resetLocalEditorState({
            clearCache,
            location: { search: '', hash: '#/' },
            storage: storage(null),
        })).toEqual({
            ok: false,
            reason: 'diagram-id-unavailable',
            failureCount: 0,
        });
        expect(clearCache).not.toHaveBeenCalled();
    });

    it('returns a non-reloadable failure when any cache deletion fails', () => {
        const clearCache = vi.fn(() => ({
            ok: false,
            removedCount: 3,
            failures: [{
                storageType: 'localStorage' as const,
                operation: 'remove' as const,
                key: 'flowchart-clipboard',
            }],
        }));

        expect(resetLocalEditorState({
            clearCache,
            location: { search: '?diagram=diagram-a', hash: '' },
            storage: storage(null),
        })).toEqual({
            ok: false,
            reason: 'cache-clear-failed',
            failureCount: 1,
        });
        expect(clearCache).toHaveBeenCalledWith('diagram-a');
    });

    it('reports a successful reset only after every cache removal succeeds', () => {
        const clearCache = vi.fn(() => ({
            ok: true,
            removedCount: 19,
            failures: [],
        }));

        expect(resetLocalEditorState({
            clearCache,
            location: { search: '', hash: '#/?diagram=diagram-a' },
            storage: storage('diagram-b'),
        })).toEqual({
            ok: true,
            diagramId: 'diagram-a',
            removedCount: 19,
        });
    });

    it('keeps the confirmation open and reports a failure without reloading', () => {
        const close = vi.fn();
        const onFailure = vi.fn();
        const reload = vi.fn();

        const result = executeConfirmedLocalEditorReset({
            clearCache: () => ({
                ok: false,
                removedCount: 2,
                failures: [{ storageType: 'sessionStorage', operation: 'remove' }],
            }),
            close,
            location: { search: '?diagram=diagram-a', hash: '' },
            onFailure,
            reload,
            storage: storage(null),
        });

        expect(result.ok).toBe(false);
        expect(onFailure).toHaveBeenCalledWith(result);
        expect(close).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it('closes the confirmation before reloading after a complete reset', () => {
        const order: string[] = [];
        const onFailure = vi.fn();

        const result = executeConfirmedLocalEditorReset({
            clearCache: () => ({ ok: true, removedCount: 18, failures: [] }),
            close: () => { order.push('close'); },
            location: { search: '?diagram=diagram-a', hash: '' },
            onFailure,
            reload: () => { order.push('reload'); },
            storage: storage(null),
        });

        expect(result).toMatchObject({ ok: true, diagramId: 'diagram-a' });
        expect(order).toEqual(['close', 'reload']);
        expect(onFailure).not.toHaveBeenCalled();
    });
});
