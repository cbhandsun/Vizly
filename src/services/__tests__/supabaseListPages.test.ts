// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { collectSupabaseListPages, SUPABASE_LIST_PAGE_SIZE } from '../supabaseListPages';

describe('Supabase bounded list aggregation', () => {
    it('returns an empty list', async () => {
        expect(await collectSupabaseListPages(async () => ({ data: [], error: null }))).toEqual([]);
    });

    it('uses inclusive ranges and continues after a server-capped short page', async () => {
        const fetchPage = vi.fn()
            .mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null })
            .mockResolvedValueOnce({ data: [{ id: 'c' }], error: null })
            .mockResolvedValueOnce({ data: [], error: null });
        expect(await collectSupabaseListPages(fetchPage)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
        expect(fetchPage.mock.calls).toEqual([[0, 499], [2, 501], [3, 502]]);
    });

    it('does not publish a partial list when a later page fails', async () => {
        const failure = new Error('synthetic query failure');
        const fetchPage = vi.fn()
            .mockResolvedValueOnce({ data: [{ id: 'a' }], error: null })
            .mockResolvedValueOnce({ data: null, error: failure });
        await expect(collectSupabaseListPages(fetchPage)).rejects.toBe(failure);
    });

    it.each([null, {}, 'invalid'])('rejects malformed page %j', async data => {
        await expect(collectSupabaseListPages(async () => ({ data, error: null }))).rejects.toThrow('invalid list page');
    });

    it('rejects an oversized individual page', async () => {
        await expect(collectSupabaseListPages(async () => ({
            data: Array.from({ length: SUPABASE_LIST_PAGE_SIZE + 1 }, (_, id) => ({ id })), error: null,
        }))).rejects.toThrow('page exceeds');
    });

    it('bounds an endless response by the page budget', async () => {
        const fetchPage = vi.fn(async (from: number) => ({ data: [{ id: String(from) }], error: null }));
        await expect(collectSupabaseListPages(fetchPage)).rejects.toThrow('page limit');
        expect(fetchPage).toHaveBeenCalledTimes(1000);
    });

    it('bounds total rows without returning truncated success', async () => {
        const fetchPage = vi.fn(async (from: number) => ({ data: Array.from({ length: 500 }, (_, id) => ({ id: String(from + id) })), error: null }));
        await expect(collectSupabaseListPages(fetchPage)).rejects.toThrow('listing exceeds the row limit');
        expect(fetchPage).toHaveBeenCalledTimes(201);
    });

    it('rejects repeated IDs rather than returning inconsistent or endlessly repeated data', async () => {
        const fetchPage = vi.fn(async () => ({ data: [{ id: 'repeated' }], error: null }));
        await expect(collectSupabaseListPages(fetchPage)).rejects.toThrow('repeated a row');
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });
});
