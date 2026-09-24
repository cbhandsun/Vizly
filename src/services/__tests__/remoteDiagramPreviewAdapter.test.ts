import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadDiagram = vi.fn();

vi.mock('../UnifiedStorageService', () => ({
  unifiedStorage: {
    loadDiagram,
  },
}));

describe('remoteDiagramPreview service adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    loadDiagram.mockReset();
  });

  it('connects the core preview boundary to unified storage', async () => {
    loadDiagram.mockResolvedValue({
      content: {
        metadata: {
          preview: {
            mime: 'image/png',
            dataUrl: 'data:image/png;base64,AAAA',
            width: 320,
            height: 180,
          },
        },
      },
    });
    const { fetchRemoteDiagramPreview } = await import('../remoteDiagramPreview');

    await expect(fetchRemoteDiagramPreview('adapter-diagram')).resolves.toMatchObject({
      mime: 'image/png',
      width: 320,
      height: 180,
    });
    expect(loadDiagram).toHaveBeenCalledWith('adapter-diagram');
  });
});
