import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ bridge: null as Record<string, unknown> | null, stored: null as unknown,
  initialize: vi.fn(async () => undefined), save: vi.fn<(snapshot: unknown, persist: boolean) => Promise<void>>(), load: vi.fn<(id: string) => Promise<unknown>>() }));
vi.mock('@vizly/core/diagram-data', () => ({ getFlowDataBridge: () => fixture.bridge }));
vi.mock('@/data/DataRegistry', () => ({ dataRegistry: { initialize: fixture.initialize, getDataService: () => ({ registerDiagram: fixture.save }) } }));
vi.mock('@/services/IndexedDBStorage', () => ({ localDB: { loadDiagram: fixture.load } }));
import { saveDiagramViewerRecoveryCopy } from '../diagramViewerRecoveryCopy';
describe('committed independent recovery copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.bridge = { id: 'source', name: 'Synthetic diagram', type: 'flowchart', nodes: [], edges: [], groups: [],
      metadata: { title: 'Synthetic diagram', createdAt: '2026-10-09T02:04:07.212Z', cloud: { provider: 'supabase', id: 'source' } }, isCanvasReady: () => true };
    fixture.stored = null;
    fixture.save.mockImplementation(async snapshot => { fixture.stored = JSON.parse(JSON.stringify(snapshot)) as unknown; });
    fixture.load.mockImplementation(async () => fixture.stored);
  });
  it('creates a separate editable document with no cloud write identity and verifies committed readback', async () => {
    const id = await saveDiagramViewerRecoveryCopy('source');
    expect(id).not.toBe('source'); expect(fixture.load).toHaveBeenCalledWith(id);
    expect(fixture.save.mock.calls[0][1]).toBe(true);
    expect(fixture.stored).toMatchObject({ id, isReadonly: false, nodes: [], edges: [] });
    expect((fixture.stored as { metadata?: { cloud?: unknown } }).metadata?.cloud).toBeUndefined();
    const metadata = (fixture.stored as { metadata: { createdAt: string; updatedAt: string } }).metadata;
    expect(metadata.updatedAt).toBe(metadata.createdAt);
    expect(Number.isFinite(Date.parse(metadata.updatedAt))).toBe(true);
    expect(fixture.bridge?.id).toBe('source'); expect((fixture.bridge?.metadata as { cloud?: unknown }).cloud).toBeTruthy();
  });
  it('waits for committed persistence before reading or acknowledging the copy', async () => {
    let complete: () => void = () => { throw new Error('Not initialized'); };
    fixture.save.mockImplementation(snapshot => new Promise(resolve => { complete = () => { fixture.stored = snapshot; resolve(); }; }));
    const running = saveDiagramViewerRecoveryCopy('source');
    await vi.waitFor(() => expect(fixture.save).toHaveBeenCalledOnce());
    expect(fixture.load).not.toHaveBeenCalled(); complete(); await running; expect(fixture.load).toHaveBeenCalledOnce();
  });
  it.each(['abort', 'missing', 'different'])('fails safely when persistence or readback fails: %s', async failure => {
    if (failure === 'abort') fixture.save.mockRejectedValue(new Error('Private synthetic transaction failure'));
    if (failure === 'missing') fixture.load.mockResolvedValue(null);
    if (failure === 'different') fixture.load.mockResolvedValue({ id: 'different' });
    await expect(saveDiagramViewerRecoveryCopy('source')).rejects.toMatchObject({ code: 'copyFailed', message: 'Collaboration recovery failed' });
  });
  it('does not save an unready or absent canvas', async () => {
    fixture.bridge = { nodes: [], isCanvasReady: () => false };
    await expect(saveDiagramViewerRecoveryCopy('source')).rejects.toMatchObject({ code: 'copyFailed' });
    fixture.bridge = null;
    await expect(saveDiagramViewerRecoveryCopy('source')).rejects.toMatchObject({ code: 'copyFailed' });
    expect(fixture.save).not.toHaveBeenCalled();
  });
});
