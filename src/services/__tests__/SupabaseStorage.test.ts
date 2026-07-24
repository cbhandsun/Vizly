import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandardDiagramData } from '@/core/models/DiagramModels';

const mockSupabase = vi.hoisted(() => ({
    auth: {
        getUser: vi.fn(),
    },
    from: vi.fn(),
}));

vi.mock('../supabase', () => ({
    supabase: mockSupabase,
}));

const createTableMock = (result: any = { data: null, error: null }) => {
    const table: any = {
        delete: vi.fn(() => table),
        insert: vi.fn(() => table),
        upsert: vi.fn(() => table),
        select: vi.fn(() => table),
        single: vi.fn(() => Promise.resolve(result)),
        eq: vi.fn(() => table),
        order: vi.fn(() => Promise.resolve(result)),
        limit: vi.fn(() => Promise.resolve(result)),
    };
    return table;
};

const makeDiagramContent = () => ({
    id: 'diagram-1',
    name: 'Diagram',
    type: 'flowchart',
    version: '1.0.0',
    nodes: [{ id: 'n1', description: 'Node 1', type: 'flowchart', domain: 'default' }],
    edges: [],
});

const makeVersionSnapshot = () => ({
    nodes: [{
        id: 'n1',
        position: { x: 0, y: 0 },
        data: {
            label: 'Node',
            constructor: { polluted: true },
            nested: { __proto__: { polluted: true }, ok: true },
        },
    }],
    edges: [],
});

const makeAIConfig = () => ({
    activeModelKey: 'openai:gpt-4o',
    systemPrompt: 'prompt',
    providers: [{
        id: 'openai',
        name: 'OpenAI',
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'ENC2:secret',
        models: [{ id: 'gpt-4o', name: 'GPT-4o', enabled: true }],
    }],
});

describe('SupabaseStorageProvider', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('uses the authenticated user when saving new anonymous diagrams', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const table = createTableMock({
            data: {
                id: 'diagram-1',
                title: 'Diagram',
                content: makeDiagramContent(),
                user_id: '11111111-1111-4111-8111-111111111111',
                updated_at: '2026-06-11T00:00:00.000Z',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await provider.saveDiagram({
            id: 'diagram-1',
            title: 'Diagram',
            content: makeDiagramContent(),
            user_id: 'anonymous',
            updated_at: '',
        });

        expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({
            user_id: '11111111-1111-4111-8111-111111111111',
        }));
    });

    it('preserves the existing diagram owner when an editor saves a shared diagram', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const table = createTableMock({
            data: {
                id: 'diagram-1',
                title: 'Shared Diagram',
                content: makeDiagramContent(),
                user_id: '11111111-1111-4111-8111-111111111111',
                updated_at: '2026-06-11T00:00:00.000Z',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await provider.saveDiagram({
            id: 'diagram-1',
            title: 'Shared Diagram',
            content: makeDiagramContent(),
            user_id: '11111111-1111-4111-8111-111111111111',
            updated_at: '',
        });

        expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({
            user_id: '11111111-1111-4111-8111-111111111111',
        }));
    });

    it('rejects config saves when the expected user does not match the authenticated user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(
            provider.saveConfig('ai_config', makeAIConfig(), '22222222-2222-4222-8222-222222222222')
        ).rejects.toThrow('user mismatch');

        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('filters config reads by the authenticated user id', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const table = createTableMock({
            data: [{ value: makeAIConfig() }],
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.loadConfig('ai_config')).resolves.toEqual(makeAIConfig());
        expect(table.eq).toHaveBeenCalledWith('user_id', '11111111-1111-4111-8111-111111111111');
        expect(table.eq).toHaveBeenCalledWith('key', 'ai_config');
    });

    it('normalizes ai_config before saving and strips dangerous keys', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const table = createTableMock({
            data: { user_id: '11111111-1111-4111-8111-111111111111', key: 'ai_config', value: makeAIConfig() },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await provider.saveConfig('ai_config', {
            ...makeAIConfig(),
            constructor: { polluted: true },
            providers: [{
                ...makeAIConfig().providers[0],
                constructor: { polluted: true },
                models: [
                    { id: 'gpt-4o', name: 'GPT-4o', enabled: true, onclick: 'bad' },
                    null,
                ],
            }],
        }, '11111111-1111-4111-8111-111111111111');

        const savedValue = table.upsert.mock.calls[0][0].value;
        expect(Object.hasOwn(savedValue, 'constructor')).toBe(false);
        expect(Object.hasOwn(savedValue.providers[0], 'constructor')).toBe(false);
        expect(savedValue.providers[0].models).toEqual([
            { id: 'gpt-4o', name: 'GPT-4o', enabled: true },
        ]);
    });

    it('rejects unsupported config keys before touching Supabase tables', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(
            provider.saveConfig('unknown-key', { ok: true }, '11111111-1111-4111-8111-111111111111')
        ).rejects.toThrow('Unsupported cloud config key');

        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('filters invalid config rows from loadAllConfigs', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const table = createTableMock({
            data: [
                { key: 'ai_config', value: makeAIConfig() },
                { key: 'unknown-key', value: { ok: true } },
                { key: 'layered-config-user', value: { safe: true, constructor: { polluted: true } } },
                { key: 'ai_config', value: { providers: 'bad' } },
            ],
            error: null,
        });
        table.eq.mockResolvedValueOnce({
            data: [
                { key: 'ai_config', value: makeAIConfig() },
                { key: 'unknown-key', value: { ok: true } },
                { key: 'layered-config-user', value: { safe: true, constructor: { polluted: true } } },
                { key: 'ai_config', value: { providers: 'bad' } },
            ],
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.loadAllConfigs()).resolves.toEqual([
            { key: 'ai_config', value: makeAIConfig() },
            { key: 'layered-config-user', value: { safe: true } },
        ]);
    });

    it('normalizes Supabase diagram content on load', async () => {
        const table = createTableMock({
            data: {
                id: 'diagram-1',
                title: 'Cloud Diagram',
                content: {
                    name: 'Cloud Diagram',
                    nodes: [
                        {
                            id: 'n1',
                            label: 'Node 1',
                            domain: 'ops',
                            constructor: { polluted: true },
                        },
                    ],
                    edges: [],
                    metadata: { title: 'Metadata Title' },
                },
                user_id: '11111111-1111-4111-8111-111111111111',
                updated_at: '2026-06-11T00:00:00.000Z',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        const saved = await provider.loadDiagram('diagram-1');
        const savedContent = saved.content as StandardDiagramData;

        expect(saved.title).toBe('Metadata Title');
        expect(saved.content).toEqual(expect.objectContaining({
            id: 'diagram-1',
            name: 'Cloud Diagram',
            type: 'custom',
            version: '1.0.0',
        }));
        expect(savedContent.nodes).toEqual([
            expect.objectContaining({ id: 'n1', description: 'Node 1', domain: 'ops' }),
        ]);
        expect(Object.hasOwn(savedContent.nodes[0], 'constructor')).toBe(false);
    });

    it('filters malformed Supabase diagram metadata rows', async () => {
        const table = createTableMock({
            data: [
                {
                    id: 'diagram-1',
                    title: 'Diagram',
                    updated_at: '2026-06-11T00:00:00.000Z',
                    user_id: '11111111-1111-4111-8111-111111111111',
                },
                {
                    id: '',
                    title: 'Missing id',
                    updated_at: '2026-06-11T00:00:00.000Z',
                    user_id: '11111111-1111-4111-8111-111111111111',
                },
                {
                    id: 'bad-date',
                    title: 'Bad Date',
                    updated_at: 'not-a-date',
                    user_id: '11111111-1111-4111-8111-111111111111',
                },
                null,
            ],
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        const diagrams = await provider.listDiagrams();

        expect(diagrams).toHaveLength(1);
        expect(diagrams[0]).toEqual({
            id: 'diagram-1',
            title: 'Diagram',
            updatedAt: new Date('2026-06-11T00:00:00.000Z'),
            userId: '11111111-1111-4111-8111-111111111111',
        });
    });

    it('rejects malformed Supabase diagram rows on load', async () => {
        const table = createTableMock({
            data: null,
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.loadDiagram('diagram-1')).rejects.toThrow('invalid diagram row');
    });

    it('rejects invalid Supabase diagram content on load', async () => {
        const table = createTableMock({
            data: {
                id: 'diagram-1',
                title: 'Bad Diagram',
                content: { nodes: 'bad', edges: [] },
                user_id: '11111111-1111-4111-8111-111111111111',
                updated_at: '2026-06-11T00:00:00.000Z',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.loadDiagram('diagram-1')).rejects.toThrow('Remote diagram is invalid');
    });

    it('requires an authenticated user before deleting Supabase diagrams', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: null },
            error: null,
        });
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.deleteDiagram('diagram-1')).rejects.toThrow('authenticated user');
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('throws when a Supabase delete affects no rows', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const table = createTableMock();
        table.select.mockResolvedValueOnce({ data: [], error: null });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.deleteDiagram('diagram-1')).rejects.toThrow('was not deleted');
        expect(table.delete).toHaveBeenCalled();
        expect(table.eq).toHaveBeenCalledWith('id', 'diagram-1');
        expect(table.select).toHaveBeenCalledWith('id');
    });

    it('confirms Supabase diagram deletion by requiring one deleted row', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const table = createTableMock();
        table.select.mockResolvedValueOnce({ data: [{ id: 'diagram-1' }], error: null });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.deleteDiagram('diagram-1')).resolves.toBeUndefined();
    });

    it('rejects oversized Supabase diagram content on save before upsert', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.saveDiagram({
            id: 'diagram-1',
            title: 'Bad Diagram',
            content: {
                ...makeDiagramContent(),
                nodes: Array.from({ length: 5_001 }, (_, index) => ({
                    id: `n-${index}`,
                    description: 'Node',
                    type: 'flowchart',
                    domain: 'default',
                })),
            },
            user_id: 'anonymous',
            updated_at: '',
        })).rejects.toThrow('too many nodes');

        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('sanitizes version snapshots before saving to Supabase', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const table = createTableMock({
            data: {
                id: '22222222-2222-4222-8222-222222222222',
                diagram_id: '11111111-1111-4111-8111-111111111111',
                snapshot_data: JSON.parse(JSON.stringify(makeVersionSnapshot())),
                author_id: '11111111-1111-4111-8111-111111111111',
                created_at: '2026-06-11T00:00:00.000Z',
                message: 'Saved',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        const version = await provider.saveVersion(
            '11111111-1111-4111-8111-111111111111',
            JSON.parse(JSON.stringify(makeVersionSnapshot())),
            '  Saved  '
        );

        const inserted = table.insert.mock.calls[0][0];
        expect(inserted.message).toBe('Saved');
        expect(inserted.snapshot_data.nodes[0].data).toEqual({ label: 'Node', nested: { ok: true } });
        expect(version.snapshotData).not.toBeNull();
        if (!version.snapshotData) throw new Error('Expected saved snapshot data.');
        expect(version.snapshotData.nodes[0].data).toEqual({ label: 'Node', nested: { ok: true } });
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('rejects invalid version snapshots before inserting to Supabase', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
            error: null,
        });
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.saveVersion(
            '11111111-1111-4111-8111-111111111111',
            { nodes: 'bad', edges: [] },
            'bad'
        )).rejects.toThrow('valid nodes and edges');

        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('sanitizes loaded Supabase version snapshots', async () => {
        const table = createTableMock({
            data: {
                id: '22222222-2222-4222-8222-222222222222',
                diagram_id: '11111111-1111-4111-8111-111111111111',
                snapshot_data: JSON.parse(JSON.stringify(makeVersionSnapshot())),
                author_id: '11111111-1111-4111-8111-111111111111',
                created_at: '2026-06-11T00:00:00.000Z',
                message: 'Loaded',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        const version = await provider.loadVersion(
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222'
        );

        expect(version?.snapshotData).not.toBeNull();
        if (!version?.snapshotData) throw new Error('Expected loaded snapshot data.');
        expect(version?.snapshotData.nodes[0].data).toEqual({ label: 'Node', nested: { ok: true } });
    });

    it('filters malformed Supabase version list rows', async () => {
        const table = createTableMock({
            data: [
                {
                    id: '22222222-2222-4222-8222-222222222222',
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    author_id: '11111111-1111-4111-8111-111111111111',
                    created_at: '2026-06-11T00:00:00.000Z',
                    message: 'Loaded',
                },
                {
                    id: 'not-a-uuid',
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    author_id: '11111111-1111-4111-8111-111111111111',
                    created_at: '2026-06-11T00:00:00.000Z',
                    message: 'Bad',
                },
                {
                    id: '33333333-3333-4333-8333-333333333333',
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    author_id: '11111111-1111-4111-8111-111111111111',
                    created_at: 'not-a-date',
                    message: 'Bad date',
                },
            ],
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        const versions = await provider.listVersions('11111111-1111-4111-8111-111111111111');

        expect(versions).toEqual([{
            id: '22222222-2222-4222-8222-222222222222',
            diagramId: '11111111-1111-4111-8111-111111111111',
            snapshotData: null,
            authorId: '11111111-1111-4111-8111-111111111111',
            createdAt: new Date('2026-06-11T00:00:00.000Z').getTime(),
            message: 'Loaded',
        }]);
    });

    it('returns null for malformed loaded Supabase version rows', async () => {
        const table = createTableMock({
            data: {
                id: 'not-a-uuid',
                diagram_id: '11111111-1111-4111-8111-111111111111',
                snapshot_data: JSON.parse(JSON.stringify(makeVersionSnapshot())),
                author_id: '11111111-1111-4111-8111-111111111111',
                created_at: '2026-06-11T00:00:00.000Z',
                message: 'Loaded',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();

        await expect(provider.loadVersion(
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222'
        )).resolves.toBeNull();
    });
});
