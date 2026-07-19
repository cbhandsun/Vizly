import { describe, expect, it, vi } from 'vitest';

import {
  createDiagramViewerSaveCopy,
  isDiagramViewerBridgeSavable,
  saveDiagramViewerCloudReplica,
  saveDiagramViewerDirectCloud,
  syncDiagramViewerBridgeCloudReplica,
} from '../diagramViewerSave';

describe('diagramViewerSave', () => {
  it('checks whether a bridge has savable diagram data', () => {
    expect(isDiagramViewerBridgeSavable(undefined)).toBe(false);
    expect(isDiagramViewerBridgeSavable({ id: 'a' })).toBe(false);
    expect(isDiagramViewerBridgeSavable({ id: 'a', nodes: [] })).toBe(true);
  });

  it('creates and syncs cloud save copies', () => {
    const bridge = { id: 'old', name: 'Old', nodes: [], metadata: { foo: 'bar' } };
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
    expect(bridge.metadata.cloud).toEqual({
      provider: 'supabase',
      id: 'cloud-id',
      title: 'Cloud Name',
    });
  });

  it('saves a cloud replica and updates bridge metadata', async () => {
    const bridge = { id: 'old', name: 'Old', nodes: [], metadata: {} };
    const saveDiagram = vi.fn().mockResolvedValue(undefined);
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
    expect(bridge.metadata.cloud.provider).toBe('supabase');
  });

  it('saves direct cloud updates when cloud metadata exists', async () => {
    const saveDiagram = vi.fn().mockResolvedValue(undefined);
    const invalidatePreview = vi.fn();

    const result = await saveDiagramViewerDirectCloud({
      bridge: {
        id: 'bridge-id',
        nodes: [],
        metadata: { cloud: { provider: 's3', id: 'cloud-id', title: 'Cloud Title' } },
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
      saveDiagram: vi.fn().mockResolvedValue(undefined),
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
});
