// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createS3FetchClient } from '../s3FetchClient';
import { S3ConditionalWriteConflictError } from '../s3ObjectRevision';
const config = { endpoint: 'https://s3.example.com', bucket: 'diagrams', region: 'us-east-1', accessKeyId: 'TEST', secretAccessKey: 'synthetic-secret' };
afterEach(() => vi.unstubAllGlobals());
describe('S3 conditional response and cancellation boundary', () => {
    it('invokes the default browser fetch with the global receiver', async () => {
        const browserFetch = vi.fn<typeof fetch>(function (this: unknown) {
            if (this !== globalThis) throw new TypeError('Illegal invocation');
            return Promise.resolve(new Response(null, { headers: { etag: '"valid"' } }));
        });
        vi.stubGlobal('fetch', browserFetch);
        await expect(createS3FetchClient(config).putObject('doc.json', '{}', 'application/json')).resolves.toEqual({ etag: '"valid"' });
        expect(browserFetch).toHaveBeenCalledOnce();
    });
    it.each([409, 412] as const)('surfaces HTTP %i without response content or unconditional retry', async status => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret provider response', { status }));
        const client = createS3FetchClient(config, { fetchImpl });
        const failure = await client.putObject('doc.json', '{}', 'application/json', undefined, { ifMatch: '"old-2"' }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(S3ConditionalWriteConflictError);
        expect(String(failure)).not.toContain('secret provider response');
        expect(fetchImpl).toHaveBeenCalledOnce();
    });
    it('keeps fourth argument cancellation compatible with conditional writes', async () => {
        const fetchImpl = vi.fn<typeof fetch>();
        const controller = new AbortController(); controller.abort();
        await expect(createS3FetchClient(config, { fetchImpl }).putObject('doc.json', '{}', 'application/json', controller.signal, { ifNoneMatch: '*' })).rejects.toThrow();
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('does not infer a committed revision from a malformed response ETag', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: 'W/"weak"' } }));
        expect(await createS3FetchClient(config, { fetchImpl }).putObject('doc.json', '{}', 'application/json', undefined, { ifNoneMatch: '*' })).toEqual({ etag: undefined });
        expect(fetchImpl).toHaveBeenCalledOnce();
    });
});
