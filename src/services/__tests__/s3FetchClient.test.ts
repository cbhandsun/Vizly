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
        expect(init).toEqual(expect.objectContaining({ method: 'GET', signal }));
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
});
