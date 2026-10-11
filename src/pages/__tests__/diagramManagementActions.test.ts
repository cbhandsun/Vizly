import { describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceDiagramActions,
  type WorkspaceDiagramActionDependencies,
} from '../diagramManagementActions';
import type { UnifiedDiagramItem } from '../diagramManagementPage.helpers';

const createItem = (overrides: Partial<UnifiedDiagramItem> = {}): UnifiedDiagramItem => ({
  id: 'diagram-1',
  title: 'Workspace diagram',
  updatedAt: 100,
  source: 'local',
  role: 'owner',
  raw: { id: 'diagram-1' } as UnifiedDiagramItem['raw'],
  ...overrides,
});

const dependency = <Key extends keyof WorkspaceDiagramActionDependencies>(
  value: unknown,
): WorkspaceDiagramActionDependencies[Key] => value as WorkspaceDiagramActionDependencies[Key];

const createRegistry = (dataService: object) => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getDataService: vi.fn(() => dataService),
});

const createCloudStorage = (loadDiagram: (...args: unknown[]) => unknown) => ({
  loadDiagram,
  getProvider: vi.fn(() => ({ loadDiagram })),
});

describe('workspace diagram actions', () => {
  it.each(['s3', 'supabase'] as const)('opens the %s card through its source even when another provider is active', async source => {
    const id = `${source}-document`;
    const revision = '2026-10-08T14:00:00.123456+00:00';
    const activeLoad = vi.fn(async () => { throw new Error('Wrong active provider'); });
    const sourceLoad = vi.fn().mockResolvedValue({ id, title: 'Cloud', content: { nodes: [], edges: [] }, updated_at: revision, expectedRevision: '"s3-exact-2"' });
    const getProvider = vi.fn(() => ({ loadDiagram: sourceLoad }));
    const registerRemoteDiagram = vi.fn().mockResolvedValue({ id, type: 'flowchart' });
    const actions = createWorkspaceDiagramActions({
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue({ loadDiagram: activeLoad, getProvider })),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(createRegistry({ registerRemoteDiagram }))),
      getStorage: () => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }),
      upsertDiagramConfigIndex: dependency<'upsertDiagramConfigIndex'>(vi.fn()),
    });
    await expect(actions.openDiagram(createItem({ source, raw: { id } as UnifiedDiagramItem['raw'] }), true)).resolves.toEqual({ kind: 'navigate', diagramId: id });
    expect(getProvider).toHaveBeenCalledExactlyOnceWith(source);
    expect(sourceLoad).toHaveBeenCalledExactlyOnceWith(id);
    expect(activeLoad).not.toHaveBeenCalled();
    expect(registerRemoteDiagram).toHaveBeenCalledWith(expect.anything(), expect.anything(), true, expect.objectContaining({
      metadata: expect.objectContaining({ cloud: expect.objectContaining({ provider: source, id,
        revision: source === 'supabase' ? revision : '"s3-exact-2"',
      }) }),
    }));
  });
  it.each(['s3', 'supabase'] as const)('invalidates only the opened %s diagram autosave after remote persistence commits', async source => {
    let complete: (value: { id: string; type: string }) => void = () => { throw new Error('Missing completion'); };
    const pending = new Promise<{ id: string; type: string }>(resolve => { complete = resolve; });
    const registerRemoteDiagram = vi.fn(() => pending);
    const entries = new Map([
      ['flowchart-autosave-v2-cloud-1', 'stale empty canvas'],
      ['flowchart-autosave-v2-other', 'other local edits'],
    ]);
    const removeItem = vi.fn((key: string) => { entries.delete(key); });
    const actions = createWorkspaceDiagramActions({
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue(createCloudStorage(async () => ({ id: 'cloud-1', content: { nodes: [{ id: 'remote' }], edges: [] } })))),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(createRegistry({ registerRemoteDiagram }))),
      getStorage: () => ({ getItem: key => entries.get(key) ?? null, setItem: vi.fn(), removeItem }),
      upsertDiagramConfigIndex: dependency<'upsertDiagramConfigIndex'>(vi.fn()),
    });
    const opened = actions.openDiagram(createItem({ source, raw: { id: 'cloud-1' } as UnifiedDiagramItem['raw'] }), true);
    await vi.waitFor(() => expect(registerRemoteDiagram).toHaveBeenCalled());
    expect(removeItem).not.toHaveBeenCalled();
    complete({ id: 'cloud-1', type: 'flowchart' });
    await expect(opened).resolves.toEqual({ kind: 'navigate', diagramId: 'cloud-1' });
    expect(entries.has('flowchart-autosave-v2-cloud-1')).toBe(false);
    expect(entries.get('flowchart-autosave-v2-other')).toBe('other local edits');
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('flowchart-autosave-v2-cloud-1');
  });

  it('preserves the autosave when remote registration fails', async () => {
    const removeItem = vi.fn();
    const actions = createWorkspaceDiagramActions({
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue(createCloudStorage(async () => ({ id: 'cloud-1', content: {} })))),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(createRegistry({ registerRemoteDiagram: async () => { throw new Error('Persistence failed'); } }))),
      getStorage: () => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem }),
    });
    await expect(actions.openDiagram(createItem({ source: 's3', raw: { id: 'cloud-1' } as UnifiedDiagramItem['raw'] }), true)).rejects.toThrow('Persistence failed');
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('does not navigate successfully when stale autosave invalidation fails', async () => {
    const actions = createWorkspaceDiagramActions({
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue(createCloudStorage(async () => ({ id: 'cloud-1', content: {} })))),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(createRegistry({ registerRemoteDiagram: async () => ({ id: 'cloud-1', type: 'flowchart' }) }))),
      getStorage: () => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: () => { throw new Error('Storage denied'); } }),
    });
    await expect(actions.openDiagram(createItem({ source: 's3', raw: { id: 'cloud-1' } as UnifiedDiagramItem['raw'] }), true)).rejects.toThrow('Storage denied');
  });
  it('awaits local deletion and propagates persistence failure', async () => {
    let rejectDelete: (error: Error) => void = () => { throw new Error('Missing delete promise'); };
    const pending = new Promise<void>((_resolve, reject) => { rejectDelete = reject; });
    const registry = createRegistry({ deleteDiagram: vi.fn(() => pending) });
    const actions = createWorkspaceDiagramActions({
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
    });
    let completed = false;
    const result = actions.deleteDiagram(createItem());
    const observed = result.finally(() => { completed = true; });
    const rejection = expect(observed).rejects.toThrow('Quota unavailable');
    await vi.waitFor(() => expect(registry.getDataService).toHaveBeenCalled());
    expect(completed).toBe(false);
    rejectDelete(new Error('Quota unavailable'));
    await rejection;
  });

  it('does not publish the local index before create persistence commits', async () => {
    let rejectSave: (error: Error) => void = () => { throw new Error('Missing save promise'); };
    const pending = new Promise<void>((_resolve, reject) => { rejectSave = reject; });
    const registerDiagram = vi.fn(() => pending);
    const upsertDiagramConfigIndex = vi.fn();
    const actions = createWorkspaceDiagramActions({
      createTemplateSeed: dependency<'createTemplateSeed'>(vi.fn(() => ({ id: 'seed', type: 'flowchart', name: 'New', nodes: [], edges: [] }))),
      createId: () => 'created-id',
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(createRegistry({ registerDiagram }))),
      upsertDiagramConfigIndex: dependency<'upsertDiagramConfigIndex'>(upsertDiagramConfigIndex),
    });
    const result = actions.createDiagram('blank');
    const rejection = expect(result).rejects.toThrow('Transaction aborted');
    await vi.waitFor(() => expect(registerDiagram).toHaveBeenCalled());
    expect(upsertDiagramConfigIndex).not.toHaveBeenCalled();
    rejectSave(new Error('Transaction aborted'));
    await rejection;
    expect(upsertDiagramConfigIndex).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs before loading external services', async () => {
    const loadDataRegistry = vi.fn();
    const loadUnifiedStorage = vi.fn();
    const actions = createWorkspaceDiagramActions({
      loadDataRegistry: dependency<'loadDataRegistry'>(loadDataRegistry),
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(loadUnifiedStorage),
    });
    const item = createItem({ raw: { id: '@@@' } as UnifiedDiagramItem['raw'] });

    await expect(actions.openDiagram(item, true)).resolves.toEqual({ kind: 'invalid-id' });
    await expect(actions.deleteDiagram(item)).resolves.toBe('invalid-id');
    expect(loadDataRegistry).not.toHaveBeenCalled();
    expect(loadUnifiedStorage).not.toHaveBeenCalled();
  });

  it('requires authentication before opening a Supabase diagram', async () => {
    const loadUnifiedStorage = vi.fn();
    const actions = createWorkspaceDiagramActions({
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(loadUnifiedStorage),
    });

    await expect(actions.openDiagram(createItem({ source: 'supabase' }), false)).resolves.toEqual({
      kind: 'auth-required',
    });
    expect(loadUnifiedStorage).not.toHaveBeenCalled();
  });

  it('clones a remote template with a fresh validated ID and bounded title', async () => {
    const registerRemoteDiagram = vi.fn().mockReturnValue({
      id: 'fresh-template-id',
      type: 'flowchart',
      name: 'Remote template',
    });
    const registry = createRegistry({ registerRemoteDiagram });
    const single = vi.fn().mockResolvedValue({
      data: { content: { nodes: [], edges: [] }, title: `  ${'T'.repeat(300)}  ` },
      error: null,
    });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const removeItem = vi.fn();
    const upsertDiagramConfigIndex = vi.fn();
    const actions = createWorkspaceDiagramActions({
      loadSupabaseClient: dependency<'loadSupabaseClient'>(vi.fn().mockResolvedValue({ from })),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
      createId: () => 'fresh-template-id',
      getStorage: () => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem }),
      upsertDiagramConfigIndex: dependency<'upsertDiagramConfigIndex'>(upsertDiagramConfigIndex),
      now: () => 123,
      nowIso: () => '2026-08-21T12:00:00.000Z',
    });

    await expect(actions.openDiagram(createItem({
      source: 'template',
      role: 'template',
      raw: { id: 'template-1' } as UnifiedDiagramItem['raw'],
    }), true)).resolves.toEqual({ kind: 'navigate', diagramId: 'fresh-template-id' });

    expect(registerRemoteDiagram).toHaveBeenCalledWith(
      { nodes: [], edges: [] },
      { id: 'fresh-template-id', title: 'T'.repeat(240) },
      true,
      expect.objectContaining({
        id: 'fresh-template-id',
        name: 'T'.repeat(240),
        metadata: {
          title: 'T'.repeat(240),
          createdAt: '2026-08-21T12:00:00.000Z',
          updatedAt: '2026-08-21T12:00:00.000Z',
        },
      }),
    );
    expect(upsertDiagramConfigIndex).toHaveBeenCalledWith(expect.anything(), {
      id: 'fresh-template-id',
      type: 'flowchart',
      name: 'Remote template',
      updatedAt: 123,
    });
    expect(removeItem).toHaveBeenCalledWith('flowchart-autosave-v2-fresh-template-id');
  });

  it('reports unavailable and missing template services without loading the registry', async () => {
    const loadDataRegistry = vi.fn();
    const unavailable = createWorkspaceDiagramActions({
      loadSupabaseClient: dependency<'loadSupabaseClient'>(vi.fn().mockResolvedValue(null)),
      loadDataRegistry: dependency<'loadDataRegistry'>(loadDataRegistry),
    });
    const template = createItem({
      source: 'template',
      role: 'template',
      raw: { id: 'template-1' } as UnifiedDiagramItem['raw'],
    });
    await expect(unavailable.openDiagram(template, true)).resolves.toEqual({ kind: 'unavailable' });

    const missing = createWorkspaceDiagramActions({
      loadSupabaseClient: dependency<'loadSupabaseClient'>(vi.fn().mockResolvedValue({
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: {} }) }) }) }),
      })),
      loadDataRegistry: dependency<'loadDataRegistry'>(loadDataRegistry),
    });
    await expect(missing.openDiagram(template, true)).resolves.toEqual({ kind: 'not-found' });
    expect(loadDataRegistry).not.toHaveBeenCalled();
  });

  it('normalizes cloud diagrams, preserves viewer read-only mode, and indexes the result', async () => {
    const registerRemoteDiagram = vi.fn().mockReturnValue({
      id: 'cloud-1',
      type: 'architecture',
      name: 'Cloud diagram',
    });
    const registry = createRegistry({ registerRemoteDiagram });
    const loadDiagram = vi.fn().mockResolvedValue({
      id: 'cloud-1',
      title: 'Cloud diagram',
      content: { nodes: [], edges: [] },
      updated_at: '2026-01-02T03:04:05.000Z',
    });
    const upsertDiagramConfigIndex = vi.fn();
    const actions = createWorkspaceDiagramActions({
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue(createCloudStorage(loadDiagram))),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
      getStorage: () => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }),
      upsertDiagramConfigIndex: dependency<'upsertDiagramConfigIndex'>(upsertDiagramConfigIndex),
      now: () => 456,
      nowIso: () => '2026-07-19T00:00:00.000Z',
    });

    await expect(actions.openDiagram(createItem({
      source: 's3',
      role: 'viewer',
      raw: { id: 'cloud-1' } as UnifiedDiagramItem['raw'],
    }), true)).resolves.toEqual({ kind: 'navigate', diagramId: 'cloud-1' });

    expect(registerRemoteDiagram).toHaveBeenCalledWith(
      { nodes: [], edges: [] },
      { id: 'cloud-1', title: 'Cloud diagram' },
      true,
      expect.objectContaining({
        id: 'cloud-1',
        isReadonly: true,
        metadata: expect.objectContaining({
          cloud: expect.objectContaining({ provider: 's3', openedAt: '2026-07-19T00:00:00.000Z' }),
        }),
      }),
    );
    expect(upsertDiagramConfigIndex).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: 'cloud-1',
      type: 'architecture',
      updatedAt: 456,
    }));
  });

  it('does not initialize the local registry when a cloud diagram is missing', async () => {
    const loadDataRegistry = vi.fn();
    const actions = createWorkspaceDiagramActions({
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue(createCloudStorage(vi.fn().mockResolvedValue(null)))),
      loadDataRegistry: dependency<'loadDataRegistry'>(loadDataRegistry),
    });

    await expect(actions.openDiagram(createItem({
      source: 's3',
      raw: { id: 'missing-cloud-id' } as UnifiedDiagramItem['raw'],
    }), true)).resolves.toEqual({ kind: 'not-found' });
    expect(loadDataRegistry).not.toHaveBeenCalled();
  });

  it('routes local and cloud deletion to the correct service', async () => {
    const deleteDiagram = vi.fn();
    const deleteCloudDiagram = vi.fn().mockResolvedValue(undefined);
    const registry = createRegistry({ deleteDiagram });
    const actions = createWorkspaceDiagramActions({
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue({
        deleteDiagram: deleteCloudDiagram,
      })),
    });

    await expect(actions.deleteDiagram(createItem())).resolves.toBe('deleted');
    await expect(actions.deleteDiagram(createItem({
      source: 'supabase',
      raw: { id: 'cloud-1' } as UnifiedDiagramItem['raw'],
    }))).resolves.toBe('deleted');
    expect(deleteDiagram).toHaveBeenCalledWith('diagram-1');
    expect(deleteCloudDiagram).toHaveBeenCalledWith('cloud-1');
  });

  it('creates a detached local diagram and rejects an invalid generated ID', async () => {
    const seed = {
      id: 'seed-id',
      name: 'Blank',
      type: '',
      version: '2.0',
      nodes: [],
      edges: [],
      layout: { type: 'custom', direction: 'TB', spacing: { horizontal: 80, vertical: 60 }, padding: { horizontal: 24, vertical: 16 } },
      theme: { name: 'light', displayName: 'Light', domains: {} },
    };
    const registerDiagram = vi.fn();
    const registry = createRegistry({ registerDiagram });
    const createTemplateSeed = vi.fn(() => seed);
    const actions = createWorkspaceDiagramActions({
      createTemplateSeed: dependency<'createTemplateSeed'>(createTemplateSeed),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
      createId: () => 'created-id',
      getStorage: () => null,
      nowIso: () => '2026-08-21T12:00:00.000Z',
    });

    await expect(actions.createDiagram('blank', '  未命名流程图  ')).resolves.toBe('created-id');
    expect(createTemplateSeed).toHaveBeenCalledWith('blank', { mindMapRootTopic: undefined });
    expect(registerDiagram).toHaveBeenCalledWith(expect.objectContaining({
      id: 'created-id',
      type: 'flowchart',
      name: '未命名流程图',
      metadata: expect.objectContaining({
        title: '未命名流程图',
        createdAt: '2026-08-21T12:00:00.000Z',
        updatedAt: '2026-08-21T12:00:00.000Z',
      }),
    }));
    expect(seed).toMatchObject({ id: 'seed-id', type: '' });

    await actions.createDiagram('blank', 'x'.repeat(400));
    expect(registerDiagram.mock.calls.at(-1)?.[0].name).toHaveLength(240);

    await actions.createDiagram('mindmap', '新建思维导图', '中心主题');
    expect(createTemplateSeed).toHaveBeenLastCalledWith('mindmap', { mindMapRootTopic: '中心主题' });

    const invalid = createWorkspaceDiagramActions({
      createTemplateSeed: dependency<'createTemplateSeed'>(vi.fn(() => seed)),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
      createId: () => '@@@',
    });
    await expect(invalid.createDiagram('blank')).rejects.toThrow('Generated diagram id is invalid');
  });
});
