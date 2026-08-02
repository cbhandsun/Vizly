import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    coerceShareViewTitle,
    createSharedDiagramLocalId,
    runShareViewRequest,
} from '../shareViewBoundary';

describe('shareViewBoundary', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('normalizes, bounds, and safely falls back shared titles', () => {
        expect(coerceShareViewTitle('  Quarterly\n\tFlow  ', 'Fallback')).toBe('Quarterly Flow');
        expect(coerceShareViewTitle('', '  Fallback title  ')).toBe('Fallback title');
        expect(coerceShareViewTitle(null, undefined)).toBe('Shared Diagram');
        expect(coerceShareViewTitle('x'.repeat(10_000), 'Fallback')).toHaveLength(240);
    });

    it('derives an internal id only from a valid share record UUID', () => {
        expect(createSharedDiagramLocalId('44444444-4444-4444-8444-444444444444')).toBe(
            'shared-record-44444444-4444-4444-8444-444444444444'
        );
        expect(createSharedDiagramLocalId('share-token-123456')).toBeNull();
        expect(createSharedDiagramLocalId({ id: '44444444-4444-4444-8444-444444444444' })).toBeNull();
    });

    it('returns success without leaking loader exceptions', async () => {
        await expect(runShareViewRequest(async () => ({ id: 'safe' }))).resolves.toEqual({
            status: 'success',
            value: { id: 'safe' },
        });
        await expect(runShareViewRequest(async () => {
            throw new Error('Authorization: Bearer private-share-secret');
        })).resolves.toEqual({ status: 'unavailable' });
    });

    it('aborts and reports a bounded timeout', async () => {
        vi.useFakeTimers();
        let receivedSignal: AbortSignal | undefined;
        const request = runShareViewRequest(
            async (signal) => {
                receivedSignal = signal;
                return await new Promise<string>(() => undefined);
            },
            { timeoutMs: 25 }
        );

        await vi.advanceTimersByTimeAsync(25);

        await expect(request).resolves.toEqual({ status: 'timeout' });
        expect(receivedSignal?.aborted).toBe(true);
    });

    it('cancels stale requests through the owning signal', async () => {
        const owner = new AbortController();
        let receivedSignal: AbortSignal | undefined;
        const request = runShareViewRequest(
            async (signal) => {
                receivedSignal = signal;
                return await new Promise<string>(() => undefined);
            },
            { signal: owner.signal }
        );

        owner.abort();

        await expect(request).resolves.toEqual({ status: 'cancelled' });
        expect(receivedSignal?.aborted).toBe(true);
        await expect(runShareViewRequest(async () => 'unused', { timeoutMs: Number.NaN })).resolves.toEqual({
            status: 'cancelled',
        });
    });
});
