// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadDiagram = vi.fn();

describe('remoteDiagramPreview', () => {
  beforeEach(() => {
    vi.resetModules();
    loadDiagram.mockReset();
  });

  const importModule = async () => import('../remoteDiagramPreview');

  const safePreview = {
    mime: 'image/jpeg',
    dataUrl: 'data:image/jpeg;base64,AAAA',
    width: 320,
    height: 180,
  };

  it('coerces only bounded raster data-url previews', async () => {
    const { coerceRemoteDiagramPreview } = await importModule();

    expect(coerceRemoteDiagramPreview(safePreview)).toEqual(safePreview);
    expect(coerceRemoteDiagramPreview({ ...safePreview, mime: 'image/jpg' })).toEqual({
      ...safePreview,
      mime: 'image/jpeg',
    });
    expect(coerceRemoteDiagramPreview({ ...safePreview, dataUrl: 'data:image/svg+xml;base64,AAAA', mime: 'image/svg+xml' })).toBeNull();
    expect(coerceRemoteDiagramPreview({ ...safePreview, dataUrl: 'javascript:alert(1)' })).toBeNull();
    expect(coerceRemoteDiagramPreview({ ...safePreview, width: 0 })).toBeNull();
    expect(coerceRemoteDiagramPreview({ ...safePreview, height: 5000 })).toBeNull();
    expect(coerceRemoteDiagramPreview({ ...safePreview, width: 4000, height: 4000 })).toBeNull();
    expect(coerceRemoteDiagramPreview({ ...safePreview, dataUrl: `data:image/jpeg;base64,${'A'.repeat(4 * 1024 * 1024)}` })).toBeNull();
  });

  it('normalizes storage ids without rejecting S3-style keys', async () => {
    const { normalizeRemoteDiagramStorageId } = await importModule();

    expect(normalizeRemoteDiagramStorageId(' diagrams/example.json ')).toBe('diagrams/example.json');
    expect(normalizeRemoteDiagramStorageId('')).toBeNull();
    expect(normalizeRemoteDiagramStorageId('x'.repeat(513))).toBeNull();
  });

  it('fetches, validates, caches, and invalidates remote previews', async () => {
    const { fetchRemoteDiagramPreview, invalidateRemoteDiagramPreview } = await importModule();
    loadDiagram.mockResolvedValue({
      content: {
        metadata: {
          preview: safePreview,
        },
      },
    });

    await expect(fetchRemoteDiagramPreview('diagram-1', loadDiagram)).resolves.toEqual(safePreview);
    await expect(fetchRemoteDiagramPreview('diagram-1', loadDiagram)).resolves.toEqual(safePreview);
    expect(loadDiagram).toHaveBeenCalledTimes(1);

    invalidateRemoteDiagramPreview('diagram-1');
    await expect(fetchRemoteDiagramPreview('diagram-1', loadDiagram)).resolves.toEqual(safePreview);
    expect(loadDiagram).toHaveBeenCalledTimes(2);
  });

  it('caches null for rejected previews and provider failures', async () => {
    const { fetchRemoteDiagramPreview } = await importModule();
    loadDiagram.mockResolvedValueOnce({
      content: {
        metadata: {
          preview: { ...safePreview, dataUrl: 'data:image/svg+xml;base64,AAAA' },
        },
      },
    });

    await expect(fetchRemoteDiagramPreview('bad-preview', loadDiagram)).resolves.toBeNull();
    await expect(fetchRemoteDiagramPreview('bad-preview', loadDiagram)).resolves.toBeNull();
    expect(loadDiagram).toHaveBeenCalledTimes(1);

    loadDiagram.mockRejectedValueOnce(new Error('network down'));
    await expect(fetchRemoteDiagramPreview('failed-preview', loadDiagram)).resolves.toBeNull();
    expect(loadDiagram).toHaveBeenCalledTimes(2);
  });
});
