import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getApplicationDiagramRuntime } from '@vizly/core/runtime';
import type { StandardDiagramData } from '@vizly/core/types';
import { dataRegistry } from '../../data/DataRegistry';
import { localDB } from '../../services/IndexedDBStorage';
import '../configureCoreRuntimes';

const id = 'late-persisted-document';
const saved: StandardDiagramData = {
  id, name: 'Recovered cloud document', type: 'flowchart', version: '1.0',
  nodes: [{ id: 'durable-node', type: 'custom', description: 'Persisted content', domain: 'test' }],
  edges: [],
  layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 40, vertical: 40 }, padding: { horizontal: 20, vertical: 20 } },
  theme: { name: 'manual', displayName: 'Manual', domains: {} },
  metadata: { cloud: { provider: 'supabase', id, title: 'Recovered cloud document', revision: '4' } },
};

describe('application runtime persisted document loading', () => {
  const service = dataRegistry.getDataService();
  const runtime = getApplicationDiagramRuntime();

  beforeEach(() => {
    // The workspace registry has already initialized before a new persisted ID is opened.
    vi.spyOn(dataRegistry, 'initialize').mockResolvedValue();
    vi.spyOn(localDB, 'loadDiagram').mockResolvedValue(saved);
    vi.spyOn(localDB, 'saveDiagram');
  });
  afterEach(() => {
    service.deleteDiagram(id, false);
    service.deleteDiagram('unexpected-document', false);
    vi.restoreAllMocks();
  });

  it('loads content and cloud identity from persistence on an initialized registry miss', async () => {
    expect(service.getDiagram(id)).toBeNull();
    const result = await runtime.loadDiagram(id, { initialize: true });
    expect(result).toMatchObject(saved);
    expect(service.getDiagram(id)).toMatchObject(saved);
    expect(localDB.loadDiagram).toHaveBeenCalledWith(id);
    expect(localDB.saveDiagram).not.toHaveBeenCalled();
  });

  it('keeps the live registered document ahead of the persisted copy', async () => {
    service.registerDiagram({ ...saved, name: 'Live edit' }, false);
    await expect(runtime.loadDiagram(id)).resolves.toMatchObject({ name: 'Live edit' });
    expect(localDB.loadDiagram).not.toHaveBeenCalled();
  });

  it('does not overwrite a document registered while the local read is pending', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(localDB.loadDiagram).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = runtime.loadDiagram(id, { initialize: true });
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.waitFor(() => expect(localDB.loadDiagram).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    service.registerDiagram({ ...saved, name: 'Newer live edit' }, false);
    finish(saved);
    await expect(pending).resolves.toMatchObject({ name: 'Newer live edit' });
    expect(service.getDiagram(id)?.name).toBe('Newer live edit');
  });

  it('returns missing only after the persisted read confirms absence', async () => {
    vi.mocked(localDB.loadDiagram).mockResolvedValue(null);
    await expect(runtime.loadDiagram(id)).resolves.toBeNull();
    expect(localDB.loadDiagram).toHaveBeenCalledWith(id);
  });

  it('propagates storage failures instead of accepting an empty initialized canvas', async () => {
    const failure = new Error('controlled local read failure');
    vi.mocked(localDB.loadDiagram).mockRejectedValue(failure);
    await expect(runtime.loadDiagram(id)).rejects.toBe(failure);
    expect(service.getDiagram(id)).toBeNull();
    vi.mocked(localDB.loadDiagram).mockResolvedValue(saved);
    await expect(runtime.loadDiagram(id)).resolves.toMatchObject(saved);
  });

  it('rejects malformed persisted content without registering it', async () => {
    vi.mocked(localDB.loadDiagram).mockResolvedValue({ ...saved, nodes: 'invalid' });
    await expect(runtime.loadDiagram(id)).rejects.toThrow();
    expect(service.getDiagram(id)).toBeNull();
  });

  it('rejects a different persisted identity without importing another document', async () => {
    vi.mocked(localDB.loadDiagram).mockResolvedValue({ ...saved, id: 'unexpected-document' });
    await expect(runtime.loadDiagram(id)).rejects.toThrow();
    expect(service.getDiagram(id)).toBeNull();
    expect(service.getDiagram('unexpected-document')).toBeNull();
  });
});
