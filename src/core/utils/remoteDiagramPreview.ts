import { unifiedStorage } from '@/services/UnifiedStorageService';

export type RemoteDiagramPreview = {
  mime: string;
  dataUrl: string;
  width: number;
  height: number;
};

const MAX_STORAGE_ID_LENGTH = 512;
const MAX_PREVIEW_DATA_URL_CHARS = 4 * 1024 * 1024;
const MAX_PREVIEW_SIDE = 4096;
const MAX_PREVIEW_PIXELS = 9_000_000;
const SAFE_PREVIEW_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;
const SAFE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif']);

const cache = new Map<string, RemoteDiagramPreview | null>();
const inflight = new Map<string, Promise<RemoteDiagramPreview | null>>();

export const normalizeRemoteDiagramStorageId = (storageId: unknown): string | null => {
  const key = typeof storageId === 'string' ? storageId.trim() : String(storageId ?? '').trim();
  if (!key || key.length > MAX_STORAGE_ID_LENGTH) return null;
  return key;
};

export const coerceRemoteDiagramPreview = (value: unknown): RemoteDiagramPreview | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RemoteDiagramPreview>;
  const mime = typeof candidate.mime === 'string' ? candidate.mime.trim().toLowerCase() : '';
  const dataUrl = typeof candidate.dataUrl === 'string' ? candidate.dataUrl.trim() : '';
  const width = Number(candidate.width);
  const height = Number(candidate.height);

  if (!SAFE_MIME.has(mime)) return null;
  if (!dataUrl || dataUrl.length > MAX_PREVIEW_DATA_URL_CHARS) return null;
  if (!SAFE_PREVIEW_DATA_URL.test(dataUrl)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 1 || height < 1 || width > MAX_PREVIEW_SIDE || height > MAX_PREVIEW_SIDE) return null;
  if (width * height > MAX_PREVIEW_PIXELS) return null;

  return {
    mime: mime === 'image/jpg' ? 'image/jpeg' : mime,
    dataUrl,
    width: Math.round(width),
    height: Math.round(height),
  };
};

export const invalidateRemoteDiagramPreview = (storageId: string) => {
  const key = normalizeRemoteDiagramStorageId(storageId);
  if (!key) return;
  cache.delete(key);
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('remoteDiagramPreviewInvalidated', { detail: { id: key } }));
    }
  } catch {
    void 0;
  }
};

export const fetchRemoteDiagramPreview = async (storageId: string): Promise<RemoteDiagramPreview | null> => {
  const key = normalizeRemoteDiagramStorageId(storageId);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      const saved = await unifiedStorage.loadDiagram(key);
      const preview = coerceRemoteDiagramPreview((saved as { content?: { metadata?: { preview?: unknown } } } | null)?.content?.metadata?.preview);
      cache.set(key, preview);
      return preview;
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
