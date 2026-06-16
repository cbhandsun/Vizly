import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataService } from '../DataService';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { unifiedStorage } from '../UnifiedStorageService';

vi.mock('../UnifiedStorageService', () => ({
  unifiedStorage: {
    loadDiagram: vi.fn(),
  },
}));

const makeDiagram = (id: string): StandardDiagramData => ({
  id,
  name: `Query Cache ${id}`,
  type: 'flowchart',
  nodes: [
    {
      id: `${id}-node`,
      description: `Node ${id}`,
      type: 'process',
      domain: 'test',
    },
  ],
  edges: [],
  theme: {
    name: 'default',
    domains: {},
  },
  metadata: {
    description: `unique-search-${id}`,
    tags: ['query-cache'],
  },
});

describe('DataService', () => {
  const service = DataService.getInstance();
  const touchedIds = new Set<string>();

  afterEach(() => {
    touchedIds.forEach(id => service.deleteDiagram(id, false));
    touchedIds.clear();
    service.clearCache();
  });

  it('invalidates cached query results when diagrams are registered', () => {
    const id = `query-cache-${Date.now()}`;
    const query = { search: `unique-search-${id}` };

    expect(service.queryDiagrams(query)).toMatchObject({ data: [], total: 0 });

    service.registerDiagram(makeDiagram(id), false);
    touchedIds.add(id);

    const result = service.queryDiagrams(query);
    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe(id);
  });

  it('strips unsafe prototype-pollution keys before caching registered diagrams', () => {
    const id = `unsafe-register-${Date.now()}`;
    const unsafeDiagram = makeDiagram(id) as StandardDiagramData & {
      constructor?: unknown;
      metadata: NonNullable<StandardDiagramData['metadata']> & { constructor?: unknown };
    };
    unsafeDiagram.constructor = { polluted: true };
    unsafeDiagram.nodes[0].constructor = { polluted: true };
    unsafeDiagram.metadata.constructor = { polluted: true };

    service.registerDiagram(unsafeDiagram, false);
    touchedIds.add(id);

    const registered = service.getDiagram(id);
    expect(registered).not.toBeNull();
    expect(Object.hasOwn(registered ?? {}, 'constructor')).toBe(false);
    expect(Object.hasOwn(registered?.nodes[0] ?? {}, 'constructor')).toBe(false);
    expect(Object.hasOwn(registered?.metadata ?? {}, 'constructor')).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('rejects invalid remote registrations before they reach the registry', () => {
    expect(() => service.registerRemoteDiagram({
      id: 'bad-remote-register',
      name: 'Bad Remote Register',
      nodes: 'not-an-array',
      edges: [],
    }, {
      id: 'bad-remote-register',
      title: 'Bad Remote Register',
    }, false)).toThrow('Remote diagram is invalid');

    expect(service.getDiagram('bad-remote-register')).toBeNull();
  });

  it('applies remote registration overrides after content coercion', () => {
    const id = `remote-override-${Date.now()}`;
    const registered = service.registerRemoteDiagram({
      id: 'remote-source-id',
      name: 'Remote Source Name',
      type: 'flowchart',
      version: '1.0.0',
      nodes: [{
        id: 'node-1',
        description: 'Node 1',
        domain: 'ops',
      }],
      edges: [],
      metadata: {
        description: 'source metadata',
      },
    }, {
      id,
      title: 'Fallback Title',
    }, false, {
      id,
      name: 'Opened Cloud Diagram',
      metadata: {
        title: 'Opened Cloud Diagram',
        updatedAt: '2026-06-14T00:00:00.000Z',
      },
      isReadonly: true,
    });
    touchedIds.add(id);

    expect(registered.id).toBe(id);
    expect(registered.name).toBe('Opened Cloud Diagram');
    expect(registered.metadata).toMatchObject({
      description: 'source metadata',
      title: 'Opened Cloud Diagram',
      updatedAt: '2026-06-14T00:00:00.000Z',
    });
    expect(registered.isReadonly).toBe(true);
    expect(service.getDiagram(id)).toBe(registered);
  });

  it('ignores structural remote registration overrides after content coercion', () => {
    const id = `remote-override-structural-${Date.now()}`;
    const registered = service.registerRemoteDiagram({
      id,
      name: 'Remote Source Name',
      type: 'flowchart',
      version: '1.0.0',
      nodes: [{
        id: 'node-1',
        description: 'Node 1',
        domain: 'ops',
      }],
      edges: [],
    }, {
      id,
      title: 'Fallback Title',
    }, false, {
      nodes: 'not-an-array',
      edges: [{ id: 'bad-edge', source: 'missing', target: 'missing' }],
      layout: 'not-a-layout',
      metadata: 'not-metadata',
    } as any);
    touchedIds.add(id);

    expect(registered.nodes).toHaveLength(1);
    expect(registered.nodes[0].id).toBe('node-1');
    expect(registered.edges).toEqual([]);
    expect(registered.layout).toEqual(expect.objectContaining({ type: 'custom' }));
    expect(registered.metadata).toBeUndefined();
    expect(service.getDiagram(id)).toBe(registered);
  });

  it('coerces remote storage content before registering loaded diagrams', async () => {
    vi.mocked(unifiedStorage.loadDiagram).mockResolvedValueOnce({
      id: 'remote-diagram',
      title: 'Remote Diagram',
      updated_at: '2026-06-14T00:00:00.000Z',
      content: {
        id: 'unsafe-id',
        name: 'Remote Diagram',
        type: 'flowchart',
        version: '1.0.0',
        nodes: [{
          id: 'node-1',
          description: 'Node 1',
          domain: 'ops',
          constructor: { polluted: true },
        }],
        edges: [],
        metadata: {
          title: 'Remote Diagram',
          __proto__: { polluted: true },
        },
      },
    });

    const loaded = await service.loadFromStorage('remote-diagram');
    touchedIds.add('unsafe-id');

    expect(loaded?.id).toBe('unsafe-id');
    expect(Object.hasOwn(loaded?.nodes[0] ?? {}, 'constructor')).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(service.getDiagram('unsafe-id')).toBe(loaded);
  });

  it('rejects invalid remote storage content before registration', async () => {
    vi.mocked(unifiedStorage.loadDiagram).mockResolvedValueOnce({
      id: 'bad-diagram',
      title: 'Bad Diagram',
      updated_at: '2026-06-14T00:00:00.000Z',
      content: { id: 'bad-diagram', name: 'Bad Diagram', type: 'flowchart', nodes: 'not-array' },
    });

    await expect(service.loadFromStorage('bad-diagram')).rejects.toThrow('Remote diagram is invalid');
    expect(service.getDiagram('bad-diagram')).toBeNull();
  });
});
