// @ts-nocheck
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */


export type RemoteDiagramPreview = {
  mime: string;
  dataUrl: string;
  width: number;
  height: number;
};

const cache = new Map<string, RemoteDiagramPreview | null>();
const inflight = new Map<string, Promise<RemoteDiagramPreview | null>>();

export const invalidateRemoteDiagramPreview = (storageId: string) => {
  const key = String(storageId || '');
  if (!key) return;
  cache.delete(key);
  try {
    window.dispatchEvent(new CustomEvent('remoteDiagramPreviewInvalidated', { detail: { id: key } }));
  } catch { void 0; }
};

export const fetchRemoteDiagramPreview = async (storageId: string): Promise<RemoteDiagramPreview | null> => {
  const key = String(storageId || '');
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      const saved = await unifiedStorage.loadDiagram(key);
      const preview = (saved as any)?.content?.metadata?.preview as RemoteDiagramPreview | undefined;
      if (preview && typeof preview.dataUrl === 'string' && preview.dataUrl.startsWith('data:')) {
        cache.set(key, preview);
        return preview;
      }
      cache.set(key, null);
      return null;
    } catch {
      cache.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
};
