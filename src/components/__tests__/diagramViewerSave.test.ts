// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginVersionPreview, discardVersionPreview } from '../diagrams/collaboration/versionPreviewSession';
import type { FlowDataBridgeEntry } from '@vizly/core/diagram-data';

import {
  createDiagramViewerSaveCopy,
  isDiagramViewerBridgeSavable,
  normalizeDiagramSaveAsName,
  saveDiagramViewerCloudReplica,
  saveDiagramViewerDirectCloud,
  syncDiagramViewerBridgeCloudReplica,
  validateDiagramSaveAsName,
} from '../diagramViewerSave';

describe('diagramViewerSave', () => {
  it.each([{ nodes: [] }, { nodes: [{ id: 'edited-node', position: { x: 10, y: 20 }, data: { label: 'Edited' } }] }])('prepares the exact saved replica before switching bridge identity (%j)', async ({ nodes }) => {
    const bridge = { id: 'original', nodes, metadata: { title: 'Original' } };
    const revision = '2026-10-08T14:00:00.123456Z';
    const prepareReplica = vi.fn(async () => { expect(bridge.id).toBe('original'); });
    const saved = await saveDiagramViewerCloudReplica({
      bridge, selectedDiagramId: 'original', providerName: 'supabase', title: 'Copy', createId: () => 'copy-id',
      getProvider: async () => ({ isConfigured: () => true, saveDiagram: async () => ({ id: 'copy-id', updated_at: revision }) }),
      attachSnapshot: async diagram => ({ diagram }), invalidatePreview: vi.fn(), prepareReplica,
    });
    expect(saved).toBe('copy-id');
    expect(prepareReplica).toHaveBeenCalledWith(expect.objectContaining({ id: 'copy-id', title: 'Copy', provider: 'supabase', revision,
      content: expect.objectContaining({ id: 'copy-id', name: 'Copy', nodes }) }));
    expect(bridge.id).toBe('copy-id');
  });
  it('retains the source identity if mounting the saved replica cannot be prepared', async () => {
    const cloud = { provider: 'supabase', id: 'original', title: 'Original', revision: '2026-10-08T14:00:00Z' };
    const bridge = { id: 'original', nodes: [{ id: 'unsaved' }], metadata: { cloud } };
    await expect(saveDiagramViewerCloudReplica({
      bridge, selectedDiagramId: 'original', providerName: 'supabase', title: 'Copy', createId: () => 'copy-id',
      getProvider: async () => ({ isConfigured: () => true, saveDiagram: async () => ({ id: 'copy-id', updated_at: cloud.revision }) }),
      attachSnapshot: async diagram => ({ diagram }), invalidatePreview: vi.fn(),
      prepareReplica: async () => { throw new Error('controlled persistence failure'); },
    })).rejects.toThrow('controlled persistence failure');
    expect(bridge.id).toBe('original');
    expect(bridge.metadata.cloud).toBe(cloud);
    expect(bridge.nodes).toEqual([{ id: 'unsaved' }]);
  });
  afterEach(() => { discardVersionPreview('local-view'); });
  it.each(['direct', 'replica'])('blocks %s cloud writes during preview', async target => {
    beginVersionPreview('local-view', { nodes: [], edges: [] });
    const saveDiagram = vi.fn(async () => ({ id: 'saved' }));
    const bridge = { id: 'local-view', nodes: [], metadata: { cloud: { provider: 'supabase', id: 'remote', title: 'Current', revision: '2026-10-08T14:00:00Z' } } };
    const options = { bridge, selectedDiagramId: 'local-view', getProvider: async () => ({ isConfigured: () => true, saveDiagram }),
      attachSnapshot: async () => ({ diagram: bridge }), invalidatePreview: vi.fn() };
    await expect(target === 'direct' ? saveDiagramViewerDirectCloud(options)
      : saveDiagramViewerCloudReplica({ ...options, providerName: 'supabase', title: 'Copy', createId: () => 'copy' })).rejects.toThrow('历史版本');
    expect(saveDiagram).not.toHaveBeenCalled();
  });
  it.each(['direct', 'replica'])('invalidates %s preparation when preview begins and ends during snapshot work', async target => {
    const saveDiagram = vi.fn(async () => ({ id: 'saved' }));
    const bridge = { id: 'local-view', nodes: [], metadata: { cloud: { provider: 'supabase', id: 'remote', title: 'Current', revision: '2026-10-08T14:00:00Z' } } };
    const options = { bridge, selectedDiagramId: 'local-view', getProvider: async () => ({ isConfigured: () => true, saveDiagram }),
      attachSnapshot: async () => { beginVersionPreview('local-view', { nodes: [], edges: [] }); discardVersionPreview('local-view'); return { diagram: bridge }; }, invalidatePreview: vi.fn() };
    await expect(target === 'direct' ? saveDiagramViewerDirectCloud(options)
      : saveDiagramViewerCloudReplica({ ...options, providerName: 'supabase', title: 'Copy', createId: () => 'copy' })).rejects.toThrow('历史版本');
    expect(saveDiagram).not.toHaveBeenCalled();
  });
  it('uses the captured revision for direct updates and advances from the returned row', async () => {
    const revision = '2026-10-08T14:00:00.123456+00:00';
    const next = '2026-10-08T14:00:00.123457+00:00';
    const bridge = { id: 'local-view', nodes: [], metadata: { cloud: { provider: 'supabase', id: 'remote', title: 'Shared', revision } } };
    const saveDiagram = vi.fn(async (payload: unknown) => ({ ...(payload as Record<string, unknown>), updated_at: next }));
    await saveDiagramViewerDirectCloud({ bridge, selectedDiagramId: 'local-view',
      getProvider: async () => ({ isConfigured: () => true, saveDiagram }), attachSnapshot: async diagram => ({ diagram }), invalidatePreview: vi.fn(),
    });
    expect(saveDiagram).toHaveBeenCalledWith(expect.objectContaining({ id: 'remote', expectedRevision: revision }));
    expect(bridge.metadata.cloud.revision).toBe(next);
  });
  it('retains edits and loaded identity when an update conflicts', async () => {
    const cloud = { provider: 'supabase', id: 'remote', title: 'Shared', revision: '2026-10-08T14:00:00.123456Z' };
    const bridge = { id: 'local-view', nodes: [{ id: 'unsaved-node' }], metadata: { cloud } };
    const invalidatePreview = vi.fn();
    await expect(saveDiagramViewerDirectCloud({ bridge, selectedDiagramId: 'local-view',
      getProvider: async () => ({ isConfigured: () => true, saveDiagram: async () => { throw new Error('conflict'); } }),
      attachSnapshot: async diagram => ({ diagram }), invalidatePreview,
    })).rejects.toThrow('conflict');
    expect(bridge.metadata.cloud).toBe(cloud);
    expect(bridge.id).toBe('local-view');
    expect(bridge.nodes).toEqual([{ id: 'unsaved-node' }]);
    expect(invalidatePreview).not.toHaveBeenCalled();
  });
  it.each(['supabase', 's3'])('detaches a save-as copy from its original %s document', provider => {
    const originalCloud = { provider, id: 'original', title: 'Original', revision: 'old' };
    const bridge = { id: 'original', nodes: [], metadata: { cloud: originalCloud, foo: 'kept' } };
    const copy = createDiagramViewerSaveCopy({ bridge, name: 'Copy', createId: () => 'copy-id' });
    expect(copy.id).toBe('copy-id');
    expect(copy.metadata.cloud).toBeUndefined();
    expect(copy.metadata.foo).toBe('kept');
    expect(bridge.metadata.cloud).toBe(originalCloud);
    expect(bridge.id).toBe('original');
  });
  it('normalizes save-as names at the UI boundary', () => {
    expect(normalizeDiagramSaveAsName('  Diagram name  ')).toBe('Diagram name');
    expect(normalizeDiagramSaveAsName('')).toBeNull();
    expect(normalizeDiagramSaveAsName(null)).toBeNull();
    expect(normalizeDiagramSaveAsName('x'.repeat(501))).toBeNull();
  });

  it('distinguishes missing and oversized save-as names', () => {
    expect(validateDiagramSaveAsName('  Diagram name  ')).toEqual({
      ok: true,
      value: 'Diagram name',
    });
    expect(validateDiagramSaveAsName('   ')).toEqual({ ok: false, error: 'required' });
    expect(validateDiagramSaveAsName(null)).toEqual({ ok: false, error: 'required' });
    expect(validateDiagramSaveAsName('x'.repeat(501))).toEqual({ ok: false, error: 'tooLong' });
    expect(validateDiagramSaveAsName('x'.repeat(121), 120)).toEqual({ ok: false, error: 'tooLong' });
  });

  it('checks whether a bridge has savable diagram data', () => {
    expect(isDiagramViewerBridgeSavable(undefined)).toBe(false);
    expect(isDiagramViewerBridgeSavable({ id: 'a' })).toBe(false);
    expect(isDiagramViewerBridgeSavable({ id: 'a', nodes: [] })).toBe(true);
    expect(isDiagramViewerBridgeSavable({ id: 'a', nodes: [], isCanvasReady: () => false })).toBe(false);
    expect(isDiagramViewerBridgeSavable({ id: 'a', nodes: [], isCanvasReady: () => true })).toBe(true);
  });
  it.each([false, true])('blocks a direct save when readiness is lost before write (initially ready: %s)', async initiallyReady => {
    let ready = initiallyReady;
    const saveDiagram = vi.fn();
    const attachSnapshot = vi.fn(async (diagram: unknown) => { ready = false; return { diagram }; });
    await expect(saveDiagramViewerDirectCloud({
      bridge: { id: 'existing', nodes: [], isCanvasReady: () => ready, metadata: { cloud: { provider: 'supabase', id: 'existing', title: 'Saved', revision: '2026-10-08T14:00:00.123456Z' } } },
      selectedDiagramId: 'existing', attachSnapshot,
      getProvider: async () => ({ isConfigured: () => true, saveDiagram }), invalidatePreview: vi.fn(),
    })).rejects.toThrow('图表尚未加载完成');
    expect(saveDiagram).not.toHaveBeenCalled();
    expect(attachSnapshot).toHaveBeenCalledTimes(initiallyReady ? 1 : 0);
  });

  it('creates and syncs cloud save copies', () => {
    const bridge: FlowDataBridgeEntry = {
      id: 'old', name: 'Old', nodes: [], metadata: { foo: 'bar' },
    };
    const saveCopy = createDiagramViewerSaveCopy({
      bridge,
      name: 'New Name',
      createId: () => 'new-id',
    });

    expect(saveCopy.id).toBe('new-id');
    expect(saveCopy.name).toBe('New Name');
    expect(saveCopy.metadata.title).toBe('New Name');

    syncDiagramViewerBridgeCloudReplica({
      bridge,
      provider: 'supabase',
      id: 'cloud-id',
      title: 'Cloud Name',
    });

    expect(bridge.id).toBe('cloud-id');
    expect(bridge.metadata?.cloud).toEqual({
      provider: 'supabase',
      id: 'cloud-id',
      title: 'Cloud Name',
    });
  });
  it('does not create a local save-as copy after the source designer becomes unready', () => {
    const createId = vi.fn(() => 'new-id');
    expect(() => createDiagramViewerSaveCopy({
      bridge: { nodes: [], isCanvasReady: () => false }, name: 'Local copy', createId,
    })).toThrow('图表尚未加载完成');
    expect(createId).not.toHaveBeenCalled();
  });

  it('saves a cloud replica and updates bridge metadata', async () => {
    const bridge: FlowDataBridgeEntry = { id: 'old', name: 'Old', nodes: [], metadata: {} };
    const saveDiagram = vi.fn().mockImplementation(async payload => payload);
    const invalidatePreview = vi.fn();

    const newId = await saveDiagramViewerCloudReplica({
      bridge,
      selectedDiagramId: 'diagram-a',
      providerName: 'supabase',
      title: 'Saved Name',
      getProvider: async () => ({
        isConfigured: () => true,
        saveDiagram,
      }),
      attachSnapshot: async (diagram) => ({ diagram }),
      invalidatePreview,
      createId: () => 'new-id',
    });

    expect(newId).toBe('new-id');
    expect(saveDiagram).toHaveBeenCalledTimes(1);
    expect(invalidatePreview).toHaveBeenCalledWith('new-id');
    expect(bridge.metadata?.cloud?.provider).toBe('supabase');
  });

  it('saves direct cloud updates when cloud metadata exists', async () => {
    const saveDiagram = vi.fn().mockImplementation(async payload => payload);
    const invalidatePreview = vi.fn();

    const result = await saveDiagramViewerDirectCloud({
      bridge: {
        id: 'bridge-id',
        nodes: [],
        metadata: { cloud: { provider: 's3', id: 'cloud-id', title: 'Cloud Title', revision: '"revision-one"' } },
      },
      selectedDiagramId: 'diagram-a',
      getProvider: async () => ({
        isConfigured: () => true,
        saveDiagram,
      }),
      attachSnapshot: async (diagram) => ({ diagram }),
      invalidatePreview,
    });

    expect(result).toEqual({
      provider: 's3',
      id: 'cloud-id',
      title: 'Cloud Title',
    });
    expect(saveDiagram).toHaveBeenCalledTimes(1);
    expect(invalidatePreview).toHaveBeenCalledWith('cloud-id');
  });

  it('rejects unsupported providers and oversized titles at the save boundary', async () => {
    const provider = {
      isConfigured: () => true,
      saveDiagram: vi.fn().mockImplementation(async payload => payload),
    };

    await expect(saveDiagramViewerDirectCloud({
      bridge: {
        id: 'bridge-id',
        nodes: [],
        metadata: { cloud: { provider: 'ftp', id: 'cloud-id', title: 'Cloud Title' } },
      },
      selectedDiagramId: 'diagram-a',
      getProvider: vi.fn(async () => provider),
      attachSnapshot: async (diagram) => ({ diagram }),
      invalidatePreview: vi.fn(),
    })).rejects.toThrow('云端保存元数据无效');

    await expect(saveDiagramViewerCloudReplica({
      bridge: { id: 'bridge-id', nodes: [] },
      selectedDiagramId: 'diagram-a',
      providerName: 'supabase',
      title: 'x'.repeat(501),
      getProvider: vi.fn(async () => provider),
      attachSnapshot: async (diagram) => ({ diagram }),
      invalidatePreview: vi.fn(),
      createId: () => 'new-id',
    })).rejects.toThrow('图表名称无效');
    expect(provider.saveDiagram).not.toHaveBeenCalled();
  });

  it('uses the S3 returned filename for replica and subsequent direct saves', async () => {
    const bridge = { id: 'old', nodes: [], metadata: {} };
    const saveDiagram = vi.fn().mockResolvedValue({ id: 'new-id.json', expectedRevision: '"revision-one"' });
    const invalidatePreview = vi.fn();
    const dependencies = {
      bridge, selectedDiagramId: 'diagram-a',
      getProvider: async () => ({ isConfigured: () => true, saveDiagram }),
      attachSnapshot: async () => ({ diagram: bridge }), invalidatePreview,
    };
    expect(await saveDiagramViewerCloudReplica({ ...dependencies, providerName: 's3', title: 'Copy', createId: () => 'new-id' })).toBe('new-id.json');
    expect(bridge.metadata).toMatchObject({ cloud: { id: 'new-id.json' } });
    expect(invalidatePreview).toHaveBeenCalledWith('new-id.json');
    await saveDiagramViewerDirectCloud(dependencies);
    expect(saveDiagram.mock.calls[1][0].id).toBe('new-id.json');
  });

  it('does not mark a cloud save successful when the returned identity is invalid', async () => {
    const bridge = { id: 'old', nodes: [], metadata: {} };
    const invalidatePreview = vi.fn();
    await expect(saveDiagramViewerCloudReplica({
      bridge, selectedDiagramId: 'diagram-a', providerName: 's3', title: 'Copy',
      createId: () => 'new-id', attachSnapshot: async () => ({ diagram: bridge }),
      getProvider: async () => ({ isConfigured: () => true, saveDiagram: async () => ({ id: '' }) }),
      invalidatePreview,
    })).rejects.toThrow('invalid diagram identity');
    expect(bridge.metadata).toEqual({});
    expect(invalidatePreview).not.toHaveBeenCalled();
  });
});
