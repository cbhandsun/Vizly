// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createSupabaseRoomLeaseStore } from './supabaseRoomLeaseStore.js';
import { RecoveryRecordChangedError } from './roomRecoveryStore.js';
import { decodeRoomRecord } from './roomCheckpoint.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const leaseId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key = 'sb_secret_synthetic_test_only';
const sha = 'a'.repeat(64);
const response = (row: unknown, status = 200) => new Response(JSON.stringify(row), { status, headers: { 'content-type': 'application/json' } });
const checkpoint = () => { const doc = new Y.Doc(); try { const state = Y.encodeStateAsUpdate(doc); return { revision: '2026-10-09T00:00:00Z', base: state, state }; } finally { doc.destroy(); } };
describe('backend room leases and transactional recovery RPCs', () => {
  it('claims the actual generation, renews and releases the same lease', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ generation, expiresAt: '2026-10-09T00:00:30Z' }))
      .mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(false));
    const store = createSupabaseRoomLeaseStore('https://example.supabase.co', key, transport);
    expect((await store.claim(id, leaseId, id, 'edit'))?.generation).toBe(generation);
    expect(await store.renew(id, leaseId, generation)).toBe(true);
    expect(await store.release(id, leaseId, generation)).toBe(false);
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body))).toEqual({ p_diagram_id: id, p_lease_id: leaseId, p_generation: generation });
  });
  it('returns busy admission and rejects malformed lease receipts', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response({ generation, expiresAt: '2026-02-31T00:00:00Z' })).mockResolvedValueOnce(response('true'));
    const store = createSupabaseRoomLeaseStore('https://example.supabase.co', key, transport);
    expect(await store.claim(id, leaseId, generation, 'recovery')).toBeNull();
    await expect(store.claim(id, leaseId, generation, 'edit')).rejects.toThrow();
    await expect(store.renew(id, leaseId, generation)).rejects.toThrow();
  });
  it('inspects recovery metadata without decoding a potentially corrupt document', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ sha256: sha, bytes: 12 })).mockResolvedValueOnce(response({ sha256: sha, bytes: 0 }));
    const store = createSupabaseRoomLeaseStore('https://example.supabase.co', key, transport);
    expect(await store.inspectRecovery(id)).toEqual({ sha256: sha, bytes: 12 });
    await expect(store.inspectRecovery(id)).rejects.toThrow();
  });
  it('sends a validated checkpoint and verifies the exact recovery receipt', async () => {
    const expected = checkpoint();
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload.p_generation).toBe(generation); expect(payload.p_sha256).toBe(sha);
      expect(decodeRoomRecord(Buffer.from(String(payload.p_record), 'base64')).checkpoint?.revision).toBe(expected.revision);
      return response({ backupId: `${id}.${sha}.yjs`, previousSha256: sha, generation: payload.p_new_generation });
    });
    const store = createSupabaseRoomLeaseStore('https://example.supabase.co', key, transport);
    expect(await store.recoverCheckpoint(id, leaseId, generation, sha, expected)).toEqual({ backupId: `${id}.${sha}.yjs`, previousSha256: sha, revision: expected.revision });
  });
  it('maps transactional conflicts to recovery rejection and sanitizes other errors', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ code: '55000', message: 'Synthetic private detail' }, 409))
      .mockResolvedValueOnce(response({ code: '54000', message: 'Synthetic quota detail' }, 500));
    const store = createSupabaseRoomLeaseStore('https://example.supabase.co', key, transport);
    await expect(store.recoverCheckpoint(id, leaseId, generation, sha, checkpoint())).rejects.toBeInstanceOf(RecoveryRecordChangedError);
    await expect(store.recoverCheckpoint(id, leaseId, generation, sha, checkpoint())).rejects.toThrow(/^Atomic room storage unavailable$/);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid identity and confirmation before RPC requests', async () => {
    const transport = vi.fn<typeof fetch>(); const store = createSupabaseRoomLeaseStore('https://example.supabase.co', key, transport);
    await expect(store.claim('../room', leaseId, generation, 'edit')).rejects.toThrow();
    await expect(store.recoverCheckpoint(id, leaseId, generation, 'bad', checkpoint())).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
