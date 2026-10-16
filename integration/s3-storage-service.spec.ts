import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { S3StorageProvider } from '../src/services/StorageService';
import { createS3FetchClient, __s3FetchClientTestUtils } from '../src/services/s3FetchClient';
import { coerceS3StorageConfig } from '../src/services/storageSecurity';

const endpoint = process.env.VIZLY_S3_TEST_ENDPOINT;
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Isolated S3 test endpoint is required');
const config = coerceS3StorageConfig({ endpoint, bucket: 'vizly-integration', region: 'us-east-1',
  accessKeyId: process.env.VIZLY_S3_TEST_ACCESS_KEY, secretAccessKey: process.env.VIZLY_S3_TEST_SECRET_KEY });
if (!config) throw new Error('Isolated S3 test configuration is invalid');
const provider = S3StorageProvider.getInstance();
const client = createS3FetchClient(config);

describe('S3 storage against isolated MinIO', () => {
  beforeAll(async () => {
    vi.stubGlobal('crypto', webcrypto);
    const signed = await __s3FetchClientTestUtils.signS3Request({ config, method: 'PUT', now: new Date() });
    const response = await fetch(signed.url, { method: signed.method, headers: signed.headers });
    if (!response.ok) throw new Error(`Isolated S3 bucket initialization failed: HTTP${response.status}`);
    await response.body?.cancel();
    provider.saveConfig(config);
  });

  it('saves and reopens an empty diagram using its canonical durable id', async () => {
    const saved = await provider.saveDiagram({ id: 'empty-canvas', title: 'Empty canvas', user_id: 'fixture', updated_at: '',
      content: { id: 'empty-canvas', name: 'Empty canvas', nodes: [], edges: [] } });
    expect(saved.id).toBe('empty-canvas.json');
    const reopened = await provider.loadDiagram(saved.id);
    expect(reopened.id).toBe(saved.id);
    expect(reopened.content).toMatchObject({ id: saved.id, nodes: [], edges: [] });
    await provider.saveDiagram(reopened);
    const listed = await provider.listDiagrams();
    expect(listed.filter(item => item.id === saved.id)).toHaveLength(1);
    await provider.deleteDiagram(saved.id);
    await expect(provider.loadDiagram(saved.id)).rejects.toThrow('HTTP 404');
  });

  it('signs and reopens keys containing Unicode, spaces and reserved characters', async () => {
    const key = '路径/diagram +#%.json';
    await client.putObject(key, JSON.stringify({ id: key, name: 'Encoded key', nodes: [], edges: [] }), 'application/json');
    expect((await provider.loadDiagram(key)).id).toBe(key);
    await provider.deleteDiagram(key);
  });

  it('rejects stale and create-only conflicting writes against real MinIO without losing the first edit', async () => {
    const initial = await provider.saveDiagram({ id: 'conditional-race', title: 'Race', user_id: 'fixture', updated_at: '',
      content: { id: 'conditional-race', name: 'Original', nodes: [], edges: [] } });
    const first = await provider.loadDiagram(initial.id);
    const second = await provider.loadDiagram(initial.id);
    expect(first.expectedRevision).toBe(initial.expectedRevision);
    const saved = await provider.saveDiagram({ ...first, content: { id: first.id, name: 'First edit', nodes: [], edges: [] } });
    expect(saved.expectedRevision).not.toBe(first.expectedRevision);
    await expect(provider.saveDiagram({ ...second, content: { id: second.id, name: 'Stale edit', nodes: [], edges: [] } })).rejects.toThrow('已被修改');
    await expect(provider.saveDiagram({ ...second, expectedRevision: undefined })).rejects.toThrow('目标已存在');
    expect((await provider.loadDiagram(initial.id)).content).toMatchObject({ name: 'First edit' });
    await provider.deleteDiagram(initial.id);
  });

  it('retrieves all 1001 real objects beyond the service first-page limit', async () => {
    const keys = Array.from({ length: 1001 }, (_, index) => `pagination-${String(index).padStart(4, '0')}.json`);
    for (let start = 0; start < keys.length; start += 8) {
      await Promise.all(keys.slice(start, start + 8).map(key => client.putObject(key, '{}', 'application/json')));
    }
    const first = await client.listObjects();
    expect(first.contents).toHaveLength(1000);
    expect(first.isTruncated).toBe(true);
    expect(typeof first.nextContinuationToken).toBe('string');
    const listed = await provider.listDiagrams();
    expect(listed).toHaveLength(1001);
    expect(new Set(listed.map(item => item.id))).toEqual(new Set(keys));
  }, 30000);

  it('rejects invalid credentials and pre-cancelled reads without disclosing service content', async () => {
    const denied = createS3FetchClient({ ...config, secretAccessKey: 'synthetic-invalid-secret' });
    await expect(denied.listObjects()).rejects.toThrow(/^S3 list objects failed with HTTP 403$/);
    const cancellation = new AbortController();
    cancellation.abort();
    await expect(client.getObject('pagination-0000.json', cancellation.signal)).rejects.toThrow();
  });
});
