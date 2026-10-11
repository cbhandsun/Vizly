// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { StorageConfig } from '../StorageService';
import { __s3FetchClientTestUtils, createS3FetchClient } from '../s3FetchClient';

const config: StorageConfig = {
    endpoint: 'https://s3.example.com/root',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'super-secret',
    bucket: 'vizly-diagrams',
    region: 'us-east-1',
    s3ForcePathStyle: true,
};

describe('S3FetchClient', () => {
    it('signs list requests without exposing the secret and parses object summaries', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(`
            <ListBucketResult>
                <Contents>
                    <Key>diagram one.json</Key>
                    <LastModified>2026-09-12T01:02:03.000Z</LastModified>
                    <Size>42</Size>
                </Contents>
            </ListBucketResult>
        `, { status: 200 }));
        const signal = new AbortController().signal;
        const client = createS3FetchClient(config, {
            fetchImpl,
            now: () => new Date('2026-09-12T01:02:03.000Z'),
        });

        const result = await client.listObjects({ maxKeys: 1, prefix: 'diagram ', signal });

        expect(result.contents).toEqual([{
            key: 'diagram one.json',
            lastModified: new Date('2026-09-12T01:02:03.000Z'),
            size: 42,
        }]);
        const [url, init] = fetchImpl.mock.calls[0] ?? [];
        expect(url).toBeInstanceOf(URL);
        expect(String(url)).toContain('/root/vizly-diagrams?');
        expect(String(url)).toContain('list-type=2');
        expect(String(url)).toContain('prefix=diagram+');
        expect(init).toEqual(expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }));
        expect(init?.signal?.aborted).toBe(false);
        const headers = init?.headers as Headers;
        expect(headers.get('x-amz-date')).toBe('20260912T010203Z');
        expect(headers.get('authorization')).toContain('Credential=AKIA_TEST/20260912/us-east-1/s3/aws4_request');
        expect(headers.get('authorization')).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
        expect(headers.get('authorization')).not.toContain('super-secret');
    });

    it('builds virtual-hosted URLs while preserving encoded key segments', () => {
        const url = __s3FetchClientTestUtils.buildS3Url({
            ...config,
            endpoint: 'https://s3.example.com',
            s3ForcePathStyle: false,
        }, 'folder/a b.json');

        expect(url.origin).toBe('https://vizly-diagrams.s3.example.com');
        expect(url.pathname).toBe('/folder/a%20b.json');
    });

    it('reports invalid list XML as a bounded client error', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('<ListBucketResult>', { status: 200 }));
        const client = createS3FetchClient(config, { fetchImpl });

        await expect(client.listObjects()).rejects.toThrow('S3 list response XML is invalid');
    });

    it('returns and signs an opaque continuation token without treating it as a URL', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next+/=</NextContinuationToken></ListBucketResult>'));
        const client = createS3FetchClient(config, { fetchImpl });
        const result = await client.listObjects({ continuationToken: 'previous+/=' });
        expect(result.isTruncated).toBe(true);
        expect(result.nextContinuationToken).toBe('next+/=');
        expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('continuation-token')).toBe('previous+/=');
    });
    it('cancels a listing response stream while reading XML without parsing a partial page', async () => {
        const controller = new AbortController();
        const cancelled = vi.fn();
        const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new ReadableStream({
            start(stream) {
                stream.enqueue(new TextEncoder().encode('<ListBucketResult>'));
                queueMicrotask(() => controller.abort());
            }, cancel: cancelled,
        })));
        const client = createS3FetchClient(config, { fetchImpl });
        await expect(client.listObjects({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(cancelled).toHaveBeenCalledTimes(1);
    });

    it.each(['<NotS3/>', '<ListBucketResult><IsTruncated>sometimes</IsTruncated></ListBucketResult>'])('rejects structurally invalid listing responses', async xml => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml));
        await expect(createS3FetchClient(config, { fetchImpl }).listObjects()).rejects.toThrow('S3 list response');
    });

    it('preserves continuation token whitespace as opaque provider data', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken> next+/= </NextContinuationToken></ListBucketResult>'));
        const client = createS3FetchClient(config, { fetchImpl });
        const page = await client.listObjects();
        expect(page.nextContinuationToken).toBe(' next+/= ');
        fetchImpl.mockResolvedValue(new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'));
        await client.listObjects({ continuationToken: page.nextContinuationToken });
        expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get('continuation-token')).toBe(' next+/= ');
    });

    it('rejects truncated pages with no token and invalid page budgets', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>'));
        const client = createS3FetchClient(config, { fetchImpl });
        await expect(client.listObjects()).rejects.toThrow('continuation token');
        await expect(client.listObjects({ maxKeys: 1001 })).rejects.toThrow('page size');
        await expect(client.listObjects({ continuationToken: 'x'.repeat(4097) })).rejects.toThrow('continuation token');
    });

    it('rejects chunked object bodies before reading the full oversized payload', async () => {
        const cancel = vi.fn();
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel,
        })));
        await expect(createS3FetchClient(config, { fetchImpl }).getObject('large.json')).rejects.toThrow('byte limit');
        expect(cancel).toHaveBeenCalled();
    });

    it('times out a body that stalls after response headers and respects caller cancellation', async () => {
        vi.useFakeTimers();
        try {
            let receivedHeaders: () => void = () => undefined;
            const headersReady = new Promise<void>(resolve => { receivedHeaders = resolve; });
            const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
                receivedHeaders();
                return new Response(new ReadableStream({ start() {} }));
            });
            const client = createS3FetchClient(config, { fetchImpl, timeoutMs: 20 });
            const rejected = expect(client.getObject('slow.json')).rejects.toMatchObject({ name: 'TimeoutError' });
            await headersReady;
            await vi.advanceTimersByTimeAsync(20);
            await rejected;
            const controller = new AbortController();
            controller.abort();
            await expect(client.getObject('cancelled.json', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        } finally { vi.useRealTimers(); }
    });

    it('does not expose a provider error body containing credentials', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('token=synthetic-secret', { status: 403 }));
        await expect(createS3FetchClient(config, { fetchImpl }).getObject('private.json')).rejects.toThrow('HTTP 403');
        const retry = vi.fn<typeof fetch>().mockResolvedValue(new Response('token=synthetic-secret', { status: 403 }));
        try { await createS3FetchClient(config, { fetchImpl: retry }).getObject('private.json'); } catch (error) {
            expect(String(error)).not.toContain('synthetic-secret');
        }
    });
});
