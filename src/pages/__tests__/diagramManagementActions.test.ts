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

describe('workspace diagram actions', () => {
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
      expect.objectContaining({ id: 'fresh-template-id', name: 'T'.repeat(240) }),
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
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue({ loadDiagram })),
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
      loadUnifiedStorage: dependency<'loadUnifiedStorage'>(vi.fn().mockResolvedValue({
        loadDiagram: vi.fn().mockResolvedValue(null),
      })),
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
    const actions = createWorkspaceDiagramActions({
      createTemplateSeed: dependency<'createTemplateSeed'>(vi.fn(() => seed)),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
      createId: () => 'created-id',
      getStorage: () => null,
    });

    await expect(actions.createDiagram('blank')).resolves.toBe('created-id');
    expect(registerDiagram).toHaveBeenCalledWith(expect.objectContaining({
      id: 'created-id',
      type: 'flowchart',
    }));
    expect(seed).toMatchObject({ id: 'seed-id', type: '' });

    const invalid = createWorkspaceDiagramActions({
      createTemplateSeed: dependency<'createTemplateSeed'>(vi.fn(() => seed)),
      loadDataRegistry: dependency<'loadDataRegistry'>(vi.fn().mockResolvedValue(registry)),
      createId: () => '@@@',
    });
    await expect(invalid.createDiagram('blank')).rejects.toThrow('Generated diagram id is invalid');
  });
});
