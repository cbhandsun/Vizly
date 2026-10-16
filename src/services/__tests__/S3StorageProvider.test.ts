import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    client: { listObjects: vi.fn(), putObject: vi.fn().mockResolvedValue({ etag: '"revision-one"' }) },
}));
vi.mock('../s3FetchClient', () => ({ createS3FetchClient: () => mocks.client }));
import { S3StorageProvider } from '../StorageService';

describe('S3 durable identity and pagination', () => {
    const provider = S3StorageProvider.getInstance();
    beforeEach(() => {
        localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
        provider.saveConfig({ endpoint: 'https://s3.example.com', bucket: 'diagrams', region: 'us-east-1', accessKeyId: 'TEST', secretAccessKey: 'synthetic-secret' });
    });
    it('lists every page including objects past the 1000-entry first page', async () => {
        const contents = Array.from({ length: 1000 }, (_, i) => ({ key: `diagram-${i}.json` }));
        mocks.client.listObjects.mockResolvedValueOnce({ contents, isTruncated: true, nextContinuationToken: 'page-2' })
            .mockResolvedValueOnce({ contents: [{ key: 'last.json' }, { key: 'ignore.txt' }], isTruncated: false });
        expect(await provider.listDiagrams()).toHaveLength(1001);
        expect(mocks.client.listObjects).toHaveBeenLastCalledWith({ prefix: '', continuationToken: 'page-2' });
    });
    it('rejects repeated tokens instead of looping or presenting a partial result', async () => {
        mocks.client.listObjects.mockResolvedValue({ contents: [], isTruncated: true, nextContinuationToken: 'same' });
        await expect(provider.listDiagrams()).rejects.toThrow('continuation token');
        expect(mocks.client.listObjects).toHaveBeenCalledTimes(2);
    });
    it('continues through an empty middle page to a third page without duplicating objects', async () => {
        mocks.client.listObjects.mockResolvedValueOnce({ contents: [{ key: 'first.json' }], isTruncated: true, nextContinuationToken: 'page-2' })
            .mockResolvedValueOnce({ contents: [], isTruncated: true, nextContinuationToken: 'page-3' })
            .mockResolvedValueOnce({ contents: [{ key: 'first.json' }, { key: 'last.json' }], isTruncated: false });
        expect((await provider.listDiagrams()).map(item => item.id)).toEqual(['first.json', 'last.json']);
        expect(mocks.client.listObjects.mock.calls).toEqual([
            [{ prefix: '', continuationToken: undefined }],
            [{ prefix: '', continuationToken: 'page-2' }],
            [{ prefix: '', continuationToken: 'page-3' }],
        ]);
    });
    it('rejects a truncated empty page without its continuation token', async () => {
        mocks.client.listObjects.mockResolvedValueOnce({ contents: [], isTruncated: true });
        await expect(provider.listDiagrams()).rejects.toThrow('continuation token');
        expect(mocks.client.listObjects).toHaveBeenCalledTimes(1);
    });
    it('preserves cancellation from a later page and does not publish a partial list', async () => {
        const cancelled = new DOMException('Synthetic cancellation', 'AbortError');
        mocks.client.listObjects.mockResolvedValueOnce({ contents: [{ key: 'first.json' }], isTruncated: true, nextContinuationToken: 'next' })
            .mockRejectedValueOnce(cancelled);
        await expect(provider.listDiagrams()).rejects.toBe(cancelled);
        expect(mocks.client.listObjects).toHaveBeenCalledTimes(2);
    });
    it('does not hide errors in a later page or return earlier pages as complete', async () => {
        mocks.client.listObjects.mockResolvedValueOnce({ contents: [{ key: 'first.json' }], isTruncated: true, nextContinuationToken: 'next' }).mockRejectedValueOnce(new Error('Network failed'));
        await expect(provider.listDiagrams()).rejects.toThrow('Network failed');
    });
    it('stores and returns the same canonical id, including empty canvases', async () => {
        const saved = await provider.saveDiagram({ id: 'copy', title: 'Copy', content: { id: 'copy', nodes: [], edges: [] }, updated_at: '', user_id: 'local' });
        expect(saved.id).toBe('copy.json');
        expect(saved.content).toMatchObject({ id: 'copy.json', nodes: [] });
        expect(JSON.parse(mocks.client.putObject.mock.calls[0][1]).id).toBe(saved.id);
        await provider.saveDiagram({ ...saved });
        expect(mocks.client.putObject.mock.calls[1][0]).toBe('copy.json');
    });
    it.each([null, '', []])('rejects malformed content before a write: %j', async content => {
        await expect(provider.saveDiagram({ id: 'copy', title: 'Copy', content, updated_at: '', user_id: 'local' })).rejects.toThrow('must be an object');
        expect(mocks.client.putObject).not.toHaveBeenCalled();
    });
});
