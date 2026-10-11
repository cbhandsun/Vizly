import { createClient } from '@supabase/supabase-js';
import { BoundedRealtimeSocket } from './boundedRealtimeSocket.js';
import { createPrivateRoomNoticeBus, type PrivateRoomRealtime } from './privateRoomNoticeBus.js';

export interface PrivateSubscriptionDiagnostic {
  status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'unknown';
  reason: 'none' | 'authentication' | 'authorization' | 'transport' | 'other';
}
/** Only fixed categories cross this boundary; upstream messages may contain credentials. */
export const classifyPrivateSubscription = (status: unknown, error: unknown): PrivateSubscriptionDiagnostic => {
  const safeStatus = status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? status : 'unknown';
  const message = error instanceof Error ? error.message : '';
  const reason = !error ? 'none' : /jwt|token|authentication/i.test(message) ? 'authentication'
    : /permission|authoriz|policy/i.test(message) ? 'authorization'
      : /socket|connect|network|transport/i.test(message) ? 'transport' : 'other';
  return { status: safeStatus, reason };
};
export const createSupabaseRoomNoticeBus = (url: string, serverKey: string,
  observe?: (diagnostic: PrivateSubscriptionDiagnostic) => void) => {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid private notification configuration'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/'
    || typeof serverKey !== 'string' || !/^sb_secret_[A-Za-z0-9_-]{8,512}$/.test(serverKey)) {
    throw new Error('Invalid private notification configuration');
  }
  const client = createClient(parsed.origin, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: BoundedRealtimeSocket, timeout: 8000, logger: () => undefined },
    global: { fetch: async (input, init) => fetch(input, { ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) },
  });
  const realtime: PrivateRoomRealtime = {
    channel(topic) {
      const channel = client.channel(topic, { config: { private: true, broadcast: { ack: true, self: false }, presence: { enabled: false } } });
      return {
        receive(callback) { channel.on('broadcast', { event: 'committed' }, (message: unknown) => {
          if (message && typeof message === 'object' && 'payload' in message) callback(message.payload);
        }); },
        receivePresence(callback) { channel.on('broadcast', { event: 'presence' }, (message: unknown) => {
          if (message && typeof message === 'object' && 'payload' in message) callback(message.payload);
        }); },
        subscribe(callback) { channel.subscribe((status, error) => {
          if (observe) { try { observe(classifyPrivateSubscription(status, error)); } catch { /* Observers cannot alter admission. */ } }
          callback(status);
        }, 8000); },
        async send(notice) { return await channel.send({ type: 'broadcast', event: 'committed', payload: notice }, { timeout: 8000 }) === 'ok'; },
        async sendPresence(frame) { return await channel.send({ type: 'broadcast', event: 'presence', payload: frame }, { timeout: 8000 }) === 'ok'; },
        async close() { return await client.removeChannel(channel) === 'ok'; },
      };
    },
    disconnect() { client.realtime.disconnect(); },
  };
  return createPrivateRoomNoticeBus(realtime);
};
