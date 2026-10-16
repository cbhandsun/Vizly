// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: sdk.createClient }));
import { classifyPrivateSubscription, createSupabaseRoomNoticeBus } from './supabaseRoomNoticeBus.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const notice = { source: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', generation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version: '1' };
describe('Supabase private notification adapter configuration', () => {
  it.each([
    ['SUBSCRIBED', undefined, 'SUBSCRIBED', 'none'],
    ['CHANNEL_ERROR', new Error('Invalid JWT sb_secret_SYNTHETIC_ONLY'), 'CHANNEL_ERROR', 'authentication'],
    ['CHANNEL_ERROR', new Error('permission denied for private topic'), 'CHANNEL_ERROR', 'authorization'],
    ['CHANNEL_ERROR', new Error('WebSocket connection failed'), 'CHANNEL_ERROR', 'transport'],
    ['TIMED_OUT', new Error('synthetic sensitive text'), 'TIMED_OUT', 'other'],
    ['CLOSED', undefined, 'CLOSED', 'none'],
    ['sb_secret_SYNTHETIC_ONLY', {}, 'unknown', 'other'],
    [null, null, 'unknown', 'none'],
  ])('returns only fixed subscription categories %#', (status, error, expectedStatus, reason) => {
    expect(classifyPrivateSubscription(status, error)).toEqual({ status: expectedStatus, reason });
  });
  it('isolates diagnostic callback failures from channel admission', async () => {
    const channel = { on: vi.fn(), subscribe: vi.fn((callback: (status: string) => void) => callback('SUBSCRIBED')), send: vi.fn(async () => 'ok') };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok'), realtime: { disconnect: vi.fn() } };
    sdk.createClient.mockReturnValue(client);
    const bus = createSupabaseRoomNoticeBus('https://example.supabase.co', 'sb_secret_SYNTHETIC_ONLY', () => { throw new Error('observer failed'); });
    try { const subscription = await bus.subscribe(id, vi.fn(), vi.fn()); await subscription.publish(notice); }
    finally { await bus.stop(); }
  });
  it('routes private cursor broadcasts separately from document metadata on the same channel', async () => {
    const listeners = new Map<string, (message: unknown) => void>();
    const channel = { on: vi.fn((_type: string, filter: { event: string }, callback: (message: unknown) => void) => listeners.set(filter.event, callback)),
      subscribe: vi.fn((callback: (status: string) => void) => callback('SUBSCRIBED')), send: vi.fn(async () => 'ok') };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok'), realtime: { disconnect: vi.fn() } };
    sdk.createClient.mockReturnValue(client);
    const bus = createSupabaseRoomNoticeBus('https://example.supabase.co', 'sb_secret_SYNTHETIC_ONLY');
    try {
      const committed = vi.fn(); const presence = vi.fn(); const subscription = await bus.subscribe(id, committed, vi.fn(), presence);
      const frame = { source: notice.source, generation: notice.generation, sequence: 1,
        peers: [{ clientId: 42, userId: 'synthetic-user', state: { cursor: { x: 1, y: 2 } } }] };
      listeners.get('presence')?.({ payload: frame }); listeners.get('committed')?.({ payload: notice });
      expect(presence).toHaveBeenCalledExactlyOnceWith(frame); expect(committed).toHaveBeenCalledExactlyOnceWith(notice);
      expect(client.channel).toHaveBeenCalledTimes(1);
      await subscription.publishPresence?.(frame);
      expect(channel.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'presence', payload: frame }, { timeout: 8000 });
    } finally { await bus.stop(); }
  });
  it.each([
    ['http://example.supabase.co', 'sb_secret_SYNTHETIC_ONLY'],
    ['https://example.supabase.co/path', 'sb_secret_SYNTHETIC_ONLY'],
    ['https://user@example.supabase.co', 'sb_secret_SYNTHETIC_ONLY'],
    ['https://example.supabase.co?key=x', 'sb_secret_SYNTHETIC_ONLY'],
    ['https://example.supabase.co#key=x', 'sb_secret_SYNTHETIC_ONLY'],
    ['https://example.supabase.co', 'sb_publishable_SYNTHETIC_ONLY'],
    ['https://example.supabase.co', ''],
  ])('rejects invalid or client-scoped configuration %#', (url, key) => {
    sdk.createClient.mockClear(); expect(() => createSupabaseRoomNoticeBus(url, key)).toThrow('configuration');
    expect(sdk.createClient).not.toHaveBeenCalled();
  });
  it('uses private acknowledged metadata-only broadcasts and disables session persistence', async () => {
    let receive: (message: unknown) => void = () => { throw new Error('Missing broadcast observer'); };
    const channel = { on: vi.fn((_type: string, _filter: unknown, callback: (message: unknown) => void) => { receive = callback; }),
      subscribe: vi.fn((callback: (status: string) => void) => callback('SUBSCRIBED')),
      send: vi.fn(async () => 'ok') };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok'), realtime: { disconnect: vi.fn() } };
    sdk.createClient.mockReturnValue(client);
    const bus = createSupabaseRoomNoticeBus('https://example.supabase.co', 'sb_secret_SYNTHETIC_ONLY');
    try {
      expect(sdk.createClient).toHaveBeenLastCalledWith('https://example.supabase.co', 'sb_secret_SYNTHETIC_ONLY', expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: expect.objectContaining({ timeout: 8000, transport: expect.any(Function), logger: expect.any(Function) }),
      }));
      const accepted = vi.fn(); const subscription = await bus.subscribe(id, accepted, vi.fn());
      expect(client.channel).toHaveBeenCalledWith(`vizly-backend:v1:${id}`, {
        config: { private: true, broadcast: { ack: true, self: false }, presence: { enabled: false } },
      });
      expect(channel.on).toHaveBeenCalledWith('broadcast', { event: 'committed' }, expect.any(Function));
      receive({ payload: notice }); receive(null); receive({ payload: { ...notice, userContent: 'forbidden' } });
      expect(accepted).toHaveBeenCalledExactlyOnceWith(notice);
      await subscription.publish(notice);
      expect(channel.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'committed', payload: notice }, { timeout: 8000 });
      await subscription.close(); expect(client.removeChannel).toHaveBeenCalledExactlyOnceWith(channel);
    } finally { await bus.stop(); }
  });
});
