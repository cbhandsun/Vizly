// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createSupabaseAtomicRoomStore } from './supabaseAtomicRoomStore.js';
import { MAX_CHECKPOINT_BYTES } from './roomCheckpoint.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key = 'sb_secret_synthetic_test_only';
const leaseId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const empty = () => { const doc = new Y.Doc(); try { return Y.encodeStateAsUpdate(doc); } finally { doc.destroy(); } };
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
describe('backend-only atomic room RPC adapter', () => {
  it('reads absent and valid room states and exchanges an exact version', async () => {
    const state = empty();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response({ generation, version: '1', record: Buffer.from(state).toString('base64') }))
      .mockResolvedValueOnce(response(true));
    const store = createSupabaseAtomicRoomStore('https://example.supabase.co', key, leaseId, transport);
    expect(await store.read(id)).toBeNull();
    expect(await store.read(id)).toEqual({ generation, version: '1', record: state });
    expect(await store.compareExchange(id, generation, '1', state)).toBe(true);
    const [url, init] = transport.mock.calls[2];
    expect(String(url)).toContain('/rest/v1/rpc/vizly_exchange_atomic_room');
    expect(JSON.parse(String(init?.body))).toEqual({ p_diagram_id: id, p_generation: generation, p_version: '1', p_record: Buffer.from(state).toString('base64'), p_lease_id: leaseId });
    expect(new Headers(init?.headers).get('apikey')).toBe(key);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it('returns CAS conflict without treating it as a transport failure', async () => {
    const store = createSupabaseAtomicRoomStore('https://example.supabase.co', key, leaseId, vi.fn<typeof fetch>().mockResolvedValue(response(false)));
    expect(await store.compareExchange(id, generation, null, empty())).toBe(false);
  });
  it.each([{}, { generation, version: 1, record: 'AAA=' }, { generation, version: '1', record: 'AR==' },
    { generation, version: '1', record: '/w==' }])('rejects invalid remote records %#', row => {
    const store = createSupabaseAtomicRoomStore('https://example.supabase.co', key, leaseId, vi.fn<typeof fetch>().mockResolvedValue(response(row)));
    return expect(store.read(id)).rejects.toThrow('Atomic room storage unavailable');
  });
  it('rejects declared and streamed excessive responses before SDK JSON parsing', async () => {
    const max = 4 * Math.ceil(MAX_CHECKPOINT_BYTES / 3) + 1024;
    const declared = new Response('{}', { headers: { 'content-length': String(max + 1) } });
    const streamed = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(max + 1)); controller.close(); } }));
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(declared).mockResolvedValueOnce(streamed);
    const store = createSupabaseAtomicRoomStore('https://example.supabase.co', key, leaseId, transport);
    await expect(store.read(id)).rejects.toThrow('Atomic room storage unavailable');
    await expect(store.read(id)).rejects.toThrow('Atomic room storage unavailable');
  });
  it('never exposes raw transport errors and does not retry failed CAS calls', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('Synthetic private credential error'));
    const store = createSupabaseAtomicRoomStore('https://example.supabase.co', key, leaseId, transport);
    await expect(store.compareExchange(id, generation, '1', empty())).rejects.toThrow(/^Atomic room storage unavailable$/);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects insecure configuration and invalid local requests before transport', async () => {
    expect(() => createSupabaseAtomicRoomStore('http://example.supabase.co', key, leaseId)).toThrow();
    expect(() => createSupabaseAtomicRoomStore('https://example.supabase.co', 'sb_publishable_synthetic', leaseId)).toThrow();
    expect(() => createSupabaseAtomicRoomStore('https://user@example.supabase.co', key, leaseId)).toThrow();
    const transport = vi.fn<typeof fetch>(); const store = createSupabaseAtomicRoomStore('https://example.supabase.co', key, leaseId, transport);
    await expect(store.read('../room')).rejects.toThrow();
    await expect(store.compareExchange(id, generation, '0', empty())).rejects.toThrow();
    await expect(store.compareExchange(id, generation, '1', new Uint8Array())).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
