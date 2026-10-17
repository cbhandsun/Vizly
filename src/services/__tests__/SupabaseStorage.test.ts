import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandardDiagramData } from '@vizly/core/types';

const mockSupabase = vi.hoisted(() => ({
    auth: {
        getUser: vi.fn(),
        // Existing fixtures describe user/error; adapt them to the browser session contract.
        getSession: async () => {
            const result = await mockSupabase.auth.getUser();
            return { data: { session: result.data.user ? { user: result.data.user, access_token: 'synthetic-session' } : null }, error: result.error };
        },
    },
    from: vi.fn(),
}));

vi.mock('../supabase', () => ({
    supabase: mockSupabase,
}));

const createTableMock = (result: { data: unknown; error: unknown } = { data: null, error: null }) => {
    const table: Record<string, ReturnType<typeof vi.fn>> = {
        delete: vi.fn(() => table),
        insert: vi.fn(() => table),
        upsert: vi.fn(() => table),
        update: vi.fn(() => table),
        select: vi.fn(() => table),
        single: vi.fn(() => Promise.resolve(result)),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        eq: vi.fn(() => table),
        order: vi.fn(() => table),
        range: vi.fn().mockResolvedValueOnce(result).mockResolvedValue({ data: [], error: null }),
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
    it('rejects a zero-row permission or version miss without returning a saved identity', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null });
        const table = createTableMock({ data: null, error: null });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        await expect(new SupabaseStorageProvider().saveDiagram({
            id: 'diagram-1', title: 'Diagram', content: makeDiagramContent(), user_id: 'viewer', updated_at: '',
            expectedRevision: '2026-10-08T14:00:00.123456Z',
        })).rejects.toThrow('编辑权限已撤销');
        expect(table.update.mock.calls[0][0]).not.toHaveProperty('user_id');
    });
    it('rejects a stale writer after the first writer advances the exact revision', async () => {
        const loadedRevision = '2026-10-08T14:00:00.123456+00:00';
        let currentRevision = loadedRevision;
        const row = { id: 'diagram-1', title: 'Diagram', content: makeDiagramContent(),
            user_id: 'owner', updated_at: loadedRevision };
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'editor' } }, error: null });
        const tables: ReturnType<typeof createTableMock>[] = [];
        mockSupabase.from.mockImplementation(() => {
            const table = createTableMock();
            let expected: unknown;
            let next: unknown;
            table.eq.mockImplementation((column: string, value: unknown) => {
                if (column === 'updated_at') expected = value;
                return table;
            });
            table.update.mockImplementation((payload: { updated_at: string }) => { next = payload.updated_at; return table; });
            table.maybeSingle.mockImplementation(async () => {
                if (expected !== currentRevision) return { data: null, error: null };
                if (typeof next !== 'string') throw new Error('Missing next revision');
                currentRevision = next;
                return { data: { ...row, updated_at: next }, error: null };
            });
            tables.push(table);
            return table;
        });
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        const provider = new SupabaseStorageProvider();
        const payload = { ...row, user_id: 'editor', expectedRevision: loadedRevision };
        const first = await provider.saveDiagram(payload);
        expect(first.user_id).toBe('owner');
        expect(first.updated_at).not.toBe(loadedRevision);
        await expect(provider.saveDiagram(payload)).rejects.toThrow('本地编辑已保留');
        expect(currentRevision).toBe(first.updated_at);
        for (const table of tables) {
            expect(table.update.mock.calls[0][0]).not.toHaveProperty('user_id');
            expect(table.upsert).not.toHaveBeenCalled();
            expect(table.insert).not.toHaveBeenCalled();
        }
    });
    it.each([null, '', 'invalid', '2026-02-30T00:00:00Z'])('rejects an invalid supplied revision before a database write: %j', expectedRevision => {
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'editor' } }, error: null });
        return import('../SupabaseStorage').then(async ({ SupabaseStorageProvider }) => {
            await expect(new SupabaseStorageProvider().saveDiagram({
                id: 'diagram-1', title: 'Diagram', content: makeDiagramContent(), user_id: 'editor',
                updated_at: '', expectedRevision: expectedRevision as string,
            })).rejects.toThrow('revision is invalid');
            expect(mockSupabase.from).not.toHaveBeenCalled();
        });
    });
    it('surfaces create collisions without updating the existing row', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'editor' } }, error: null });
        const table = createTableMock({ data: null, error: { code: '23505' } });
        mockSupabase.from.mockReturnValue(table);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        await expect(new SupabaseStorageProvider().saveDiagram({
            id: 'diagram-1', title: 'Diagram', content: makeDiagramContent(), user_id: 'different-owner', updated_at: '',
        })).rejects.toThrow('另存为副本');
        expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'editor' }));
        expect(table.update).not.toHaveBeenCalled();
        expect(table.upsert).not.toHaveBeenCalled();
    });
    it.each(['2026-10-08T10:12:02.605123+00:00', '2026-10-08T10:12:02.605124+00:00'])('preserves the loaded microsecond revision %s', async revision => {
        mockSupabase.from.mockReturnValue(createTableMock({ data: {
            id: 'diagram-1', title: 'Diagram', content: makeDiagramContent(),
            user_id: 'owner', updated_at: revision,
        }, error: null }));
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        expect((await new SupabaseStorageProvider().loadDiagram('diagram-1')).updated_at).toBe(revision);
    });
    it.each([undefined, null, 'not-a-date', '2026-02-30T00:00:00Z'])('rejects a loaded row without a trustworthy revision: %j', async updated_at => {
        mockSupabase.from.mockReturnValue(createTableMock({ data: {
            id: 'diagram-1', title: 'Diagram', content: makeDiagramContent(), user_id: 'owner', updated_at,
        }, error: null }));
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        await expect(new SupabaseStorageProvider().loadDiagram('diagram-1')).rejects.toThrow('invalid diagram revision');
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('lists all diagram pages with a deterministic tie breaker', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
        const first = createTableMock({ data: [{ id: 'one', title: 'One', updated_at: '2026-06-11T00:00:00Z' }], error: null });
        const second = createTableMock({ data: [{ id: 'two', title: 'Two', updated_at: '2026-06-11T00:00:00Z' }], error: null });
        const last = createTableMock({ data: [], error: null });
        mockSupabase.from.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(last);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        expect((await new SupabaseStorageProvider().listDiagrams()).map(row => row.id)).toEqual(['one', 'two']);
        expect(first.order.mock.calls).toEqual([['updated_at', { ascending: false }], ['id', { ascending: true }]]);
        expect(first.range).toHaveBeenCalledWith(0, 499);
        expect(second.range).toHaveBeenCalledWith(1, 500);
        expect(last.range).toHaveBeenCalledWith(2, 501);
        for (const page of [first, second, last]) expect(page.eq).toHaveBeenCalledWith('user_id', 'owner');
    });

    it.each([
        { data: { user: null }, error: null },
        { data: { user: null }, error: new Error('Synthetic auth failure') },
    ])('does not list cloud ownership without a verified user: %j', async auth => {
        mockSupabase.auth.getUser.mockResolvedValue(auth);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        await expect(new SupabaseStorageProvider().listDiagrams()).rejects.toThrow();
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('keeps version pages scoped to the requested diagram and omits snapshot payloads', async () => {
        const diagramId = '11111111-1111-4111-8111-111111111111';
        const row = { id: '22222222-2222-4222-8222-222222222222', diagram_id: diagramId, created_at: '2026-06-11T00:00:00Z' };
        const first = createTableMock({ data: [row], error: null });
        const last = createTableMock({ data: [], error: null });
        mockSupabase.from.mockReturnValueOnce(first).mockReturnValueOnce(last);
        const { SupabaseStorageProvider } = await import('../SupabaseStorage');
        expect(await new SupabaseStorageProvider().listVersions(diagramId)).toHaveLength(1);
        for (const page of [first, last]) {
            expect(page.eq).toHaveBeenCalledWith('diagram_id', diagramId);
            expect(page.select).toHaveBeenCalledWith('id, diagram_id, author_id, created_at, message');
            expect(page.order).toHaveBeenCalledWith('id', { ascending: true });
        }
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

        expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({
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
            expectedRevision: '2026-06-11T00:00:00.123456+00:00',
        });

        expect(table.update).toHaveBeenCalledOnce();
        expect(table.update.mock.calls[0][0]).not.toHaveProperty('user_id');
        expect(table.eq).toHaveBeenCalledWith('id', 'diagram-1');
        expect(table.eq).toHaveBeenCalledWith('updated_at', '2026-06-11T00:00:00.123456+00:00');
        expect(table.insert).not.toHaveBeenCalled();
        expect(table.upsert).not.toHaveBeenCalled();
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
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
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
