import { readBoundedBody } from '../_shared/boundedBody.ts';

export type GatewayAdmission = { admitted: false; retryAfterSeconds: number }
  | { admitted: true; release: () => Promise<void> };
export interface GatewayResourceStore {
  acquire(userId: string, signal: AbortSignal): Promise<GatewayAdmission>;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Backend credentials never cross the gateway response boundary. */
export const createGatewayResourceStore = (
  url: string | undefined, serviceRoleKey: string | undefined, transport: typeof fetch = fetch,
): GatewayResourceStore | undefined => {
  if (!url || !serviceRoleKey || /[\r\n]/.test(serviceRoleKey)) return undefined;
  let origin: URL;
  try {
    origin = new URL(url);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
      || !(origin.protocol === 'https:' || origin.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) return undefined;
  } catch { return undefined; }
  const rpc = async (name: string, userId: string, leaseId: string, callerSignal?: AbortSignal): Promise<unknown> => {
    const deadline = AbortSignal.timeout(5_000);
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
    const response = await transport(new URL(`/rest/v1/rpc/${name}`, origin), {
      method: 'POST', signal, redirect: 'error',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_lease_id: leaseId }),
    });
    if (!response.ok) { void response.body?.cancel().catch(() => undefined); throw new Error('Resource store unavailable'); }
    return JSON.parse(await readBoundedBody(response.body, 16_384, signal));
  };
  return {
    async acquire(userId, signal) {
      if (!uuid.test(userId)) throw new Error('Invalid resource identity');
      const leaseId = crypto.randomUUID();
      const result = await rpc('vizly_acquire_ai_lease', userId, leaseId, signal);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid resource admission');
      const value = result as Record<string, unknown>;
      if (value.admitted === false && ['rate', 'concurrency'].includes(String(value.reason))
        && Number.isInteger(value.retry_after_seconds) && Number(value.retry_after_seconds) >= 1
        && Number(value.retry_after_seconds) <= 150) {
        return { admitted: false, retryAfterSeconds: Number(value.retry_after_seconds) };
      }
      if (value.admitted !== true || value.lease_id !== leaseId || typeof value.expires_at !== 'string'
        || !Number.isFinite(Date.parse(value.expires_at))
        || Date.parse(value.expires_at) - Date.now() < 125_000
        || Date.parse(value.expires_at) - Date.now() > 155_000) throw new Error('Invalid resource lease');
      let releaseTask: Promise<void> | undefined;
      return { admitted: true, release: () => releaseTask ??= (async () => {
        // Cleanup uses its own deadline; an aborted client must not abort release.
        const released = await rpc('vizly_release_ai_lease', userId, leaseId);
        if (typeof released !== 'boolean') throw new Error('Invalid resource release');
      })() };
    },
  };
};
