// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertVersionPreviewPersistenceAllowed, beginVersionPreview, canPublishVersionSnapshot,
  discardVersionPreview, endVersionPreview, withVersionPreviewPersistence } from '../versionPreviewSession';
const id = 'preview-save-boundary';
const live = { nodes: [], edges: [] };
afterEach(() => { discardVersionPreview(id); discardVersionPreview('other-save'); });

describe('version preview persistence leases', () => {
  it('allows an empty live document and releases completed and failed leases', async () => {
    await expect(withVersionPreviewPersistence(id, async assertCurrent => { assertCurrent(); return 42; })).resolves.toBe(42);
    await expect(withVersionPreviewPersistence(id, async () => { throw new Error('provider failure'); })).rejects.toThrow('provider failure');
    beginVersionPreview(id, live); discardVersionPreview(id);
    await expect(withVersionPreviewPersistence(id, async assertCurrent => { assertCurrent(); return 43; })).resolves.toBe(43);
  });
  it('blocks preparation during preview and while the live canvas is resuming', async () => {
    const action = vi.fn(async () => undefined);
    beginVersionPreview(id, live);
    await expect(withVersionPreviewPersistence(id, action)).rejects.toThrow('历史版本');
    endVersionPreview(id);
    expect(() => assertVersionPreviewPersistenceAllowed(id)).toThrow('历史版本');
    expect(action).not.toHaveBeenCalled();
    canPublishVersionSnapshot(id, live);
    await expect(withVersionPreviewPersistence(id, action)).resolves.toBeUndefined();
  });
  it('invalidates a preparing save even if a preview begins and ends before its next check', async () => {
    const write = vi.fn();
    await expect(withVersionPreviewPersistence(id, async assertCurrent => {
      await Promise.resolve();
      beginVersionPreview(id, live); endVersionPreview(id); canPublishVersionSnapshot(id, live);
      assertCurrent(); write();
    })).rejects.toThrow('历史版本');
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps concurrent saves in other diagrams independent', async () => {
    await expect(withVersionPreviewPersistence('other-save', async assertCurrent => {
      beginVersionPreview(id, live); assertCurrent(); return true;
    })).resolves.toBe(true);
  });
  it.each(['', '../bad', 'nested/../bad.json', 'nested/./bad.json', 'nested//bad.json', '/bad.json', 'bad.json/', 'bad\\key', 'bad\u0000key', 'x'.repeat(257)])('rejects invalid scopes without invoking preparation', async scope => {
    const action = vi.fn(async () => undefined);
    await expect(withVersionPreviewPersistence(scope, action)).rejects.toThrow('历史版本');
    expect(action).not.toHaveBeenCalled();
  });
  it.each(['audit.json', 'nested/audit-path.json', 'x'.repeat(256)])('preserves preview protection for canonical file IDs: %s', async scope => {
    const action = vi.fn(async (assertCurrent: () => void) => { assertCurrent(); return true; });
    try {
      await expect(withVersionPreviewPersistence(scope, action)).resolves.toBe(true);
      expect(beginVersionPreview(scope, live)).toBe(true);
      await expect(withVersionPreviewPersistence(scope, action)).rejects.toThrow('历史版本');
      expect(action).toHaveBeenCalledOnce();
      endVersionPreview(scope);
      expect(() => assertVersionPreviewPersistenceAllowed(scope)).toThrow('历史版本');
      canPublishVersionSnapshot(scope, live);
      await expect(withVersionPreviewPersistence(scope, action)).resolves.toBe(true);
    } finally { discardVersionPreview(scope); }
  });
  it('invalidates asynchronous S3 saves when a historical preview opens', async () => {
    const scope = 'nested/inflight.json';
    const write = vi.fn();
    try {
      await expect(withVersionPreviewPersistence(scope, async assertCurrent => {
        beginVersionPreview(scope, live); endVersionPreview(scope); canPublishVersionSnapshot(scope, live);
        assertCurrent(); write();
      })).rejects.toThrow('历史版本');
      expect(write).not.toHaveBeenCalled();
    } finally { discardVersionPreview(scope); }
  });
});
