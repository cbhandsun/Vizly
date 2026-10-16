import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ objects: new Map<string, { body: string; etag: string }>(), writes: 0, exposeEtag: true, calls: [] as Headers[] }));
vi.mock('../s3FetchClient', async importOriginal => {
    const actual = await importOriginal<typeof import('../s3FetchClient')>();
    const fetchImpl: typeof fetch = async (input, init) => {
        const key = new URL(String(input)).pathname.split('/').pop() ?? '';
        const headers = new Headers(init?.headers);
        backend.calls.push(headers);
        const previous = backend.objects.get(key);
        if (init?.method === 'GET') return previous
            ? new Response(previous.body, { headers: backend.exposeEtag ? { etag: previous.etag } : {} })
            : new Response(null, { status: 404 });
        if (headers.get('if-match') && headers.get('if-match') !== previous?.etag
            || headers.get('if-none-match') === '*' && previous) return new Response('private backend content', { status: 412 });
        if (typeof init?.body !== 'string') throw new Error('Invalid fixture body');
        const etag = '"revision-' + ++backend.writes + '"';
        backend.objects.set(key, { body: init.body, etag });
        return new Response(null, { headers: backend.exposeEtag ? { etag } : {} });
    };
    return { ...actual, createS3FetchClient: (config: Parameters<typeof actual.createS3FetchClient>[0]) => actual.createS3FetchClient(config, { fetchImpl }) };
});
import { S3StorageProvider } from '../StorageService';
import { S3ConditionalWriteConflictError } from '../s3ObjectRevision';
import { saveDiagramViewerCloudReplica, saveDiagramViewerDirectCloud } from '../../components/diagramViewerSave';

const provider = S3StorageProvider.getInstance();
const original = { id: 'race.json', name: 'Original', nodes: [], edges: [] };
beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    backend.objects.clear(); backend.writes = 0; backend.exposeEtag = true; backend.calls = [];
    backend.objects.set('race.json', { body: JSON.stringify(original), etag: '"original-2"' });
    provider.saveConfig({ endpoint: 'https://s3.example.com', bucket: 'diagrams', region: 'us-east-1', accessKeyId: 'TEST', secretAccessKey: 'synthetic-secret' });
});

describe('actual S3 client/provider and editor conditional save path', () => {
    it('retains exact loaded revision, signs the condition and rejects a stale second writer', async () => {
        const first = await provider.loadDiagram('race.json');
        const second = await provider.loadDiagram('race.json');
        expect(first.expectedRevision).toBe('"original-2"');
        const saved = await provider.saveDiagram({ ...first, content: { ...original, name: 'First edit' } });
        expect(saved.expectedRevision).toBe('"revision-1"');
        await expect(provider.saveDiagram({ ...second, content: { ...original, name: 'Stale edit' } })).rejects.toBeInstanceOf(S3ConditionalWriteConflictError);
        expect(JSON.parse(backend.objects.get('race.json')?.body ?? '')).toMatchObject({ name: 'First edit' });
        expect(backend.writes).toBe(1);
        expect(backend.calls[2].get('if-match')).toBe('"original-2"');
        expect(backend.calls[2].get('authorization')).toContain('SignedHeaders=content-type;host;if-match;');
    });
    it('creates only absent objects and never overwrites an existing key without a revision', async () => {
        const payload = { id: 'copy', title: 'Copy', content: original, updated_at: '', user_id: 'fixture' };
        const saved = await provider.saveDiagram(payload);
        expect(saved.id).toBe('copy.json');
        expect(backend.calls[0].get('if-none-match')).toBe('*');
        expect(backend.calls[0].get('authorization')).toContain('SignedHeaders=content-type;host;if-none-match;');
        await expect(provider.saveDiagram(payload)).rejects.toBeInstanceOf(S3ConditionalWriteConflictError);
        expect(backend.writes).toBe(1);
    });
    it('rejects invalid revisions before transmission', async () => {
        await expect(provider.saveDiagram({ id: 'race.json', title: 'Race', content: original, updated_at: '', user_id: 'fixture', expectedRevision: 'W/"original-2"' })).rejects.toThrow('有效对象版本');
        expect(backend.calls).toHaveLength(0);
    });
    it('reports missing exposed GET ETag and acknowledged PUT with unknown revision explicitly', async () => {
        backend.exposeEtag = false;
        await expect(provider.loadDiagram('race.json')).rejects.toThrow('CORS');
        await expect(provider.saveDiagram({ id: 'new', title: 'New', content: original, updated_at: '', user_id: 'fixture' })).rejects.toThrow('重新打开确认保存结果');
        expect(backend.writes).toBe(1);
        expect(backend.objects.has('new.json')).toBe(true);
    });
    it('advances editor metadata from returned ETag, retains edits on conflict and creates a detached copy', async () => {
        const loaded = await provider.loadDiagram('race.json');
        const cloud = { provider: 's3' as const, id: loaded.id, title: loaded.title, revision: loaded.expectedRevision };
        const bridge = { ...original, metadata: { cloud } };
        const stale = { ...original, name: 'Unsaved local edit', metadata: { cloud: { ...cloud } } };
        const dependencies = { selectedDiagramId: 'local', getProvider: async () => provider, attachSnapshot: async (diagram: unknown) => ({ diagram }), invalidatePreview: vi.fn() };
        await saveDiagramViewerDirectCloud({ ...dependencies, bridge });
        expect(bridge.metadata.cloud.revision).toBe('"revision-1"');
        await expect(saveDiagramViewerDirectCloud({ ...dependencies, bridge: stale })).rejects.toBeInstanceOf(S3ConditionalWriteConflictError);
        expect(stale.name).toBe('Unsaved local edit');
        expect(stale.metadata.cloud.revision).toBe('"original-2"');
        await saveDiagramViewerCloudReplica({ ...dependencies, bridge: stale, providerName: 's3', title: 'Recovered copy', createId: () => 'recovered' });
        expect(stale.metadata.cloud).toMatchObject({ id: 'recovered.json', revision: '"revision-2"' });
        expect(backend.objects.has('race.json')).toBe(true);
    });
});
