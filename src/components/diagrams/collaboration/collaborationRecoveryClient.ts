import { normalizeCollaborationServerUrl, normalizeCollaborationToken } from './collaborationSecurity';

export interface CollaborationRecoveryPlan { sha256: string; bytes: number; revision: string }
export class CollaborationRecoveryError extends Error {
  constructor(readonly code: 'denied' | 'changed' | 'unavailable' | 'copyFailed' | 'cancelled') { super('Collaboration recovery failed'); }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const revisionValid = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 40) return false;
  const parts = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}(?::\d{2})?)$/.exec(value);
  if (!parts || parts[1].startsWith('0000')) return false;
  const local = `${parts[1]}T${parts[2]}Z`; const date = new Date(local);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== local.slice(0, 19)) return false;
  const zone = parts[3]; const hours = Number(zone.slice(1, 3)); const minutes = Number(zone.slice(4) || 0);
  return zone === 'Z' || (hours <= 14 && minutes <= 59 && (hours !== 14 || minutes === 0));
};
const readJson = async (response: Response): Promise<unknown> => {
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096)) {
    await response.body?.cancel(); throw new CollaborationRecoveryError('unavailable');
  }
  if (!response.body) throw new CollaborationRecoveryError('unavailable');
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > 4096) throw new CollaborationRecoveryError('unavailable');
      parts.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch { await reader.cancel(); throw new CollaborationRecoveryError('unavailable'); }
  finally { reader.releaseLock(); }
};
export const createCollaborationRecoveryClient = (options: {
  serverUrl: string; diagramId: string; token: string; transport?: typeof fetch;
}) => {
  const server = normalizeCollaborationServerUrl(options.serverUrl);
  const token = normalizeCollaborationToken(options.token);
  if (!server || !token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.diagramId)) throw new CollaborationRecoveryError('unavailable');
  const id = options.diagramId.toLowerCase(); const url = new URL(server);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/recovery/vizly-room-${id}`;
  url.search = ''; url.hash = '';
  const request = async (method: 'GET' | 'POST', signal?: AbortSignal, body?: string) => {
    try {
      const response = await (options.transport ?? fetch)(url.toString(), { method, body, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new CollaborationRecoveryError(response.status === 403 ? 'denied' : response.status === 409 ? 'changed' : 'unavailable');
      }
      return await readJson(response);
    } catch (error: unknown) {
      if (signal?.aborted) throw new CollaborationRecoveryError('cancelled');
      if (error instanceof CollaborationRecoveryError) throw error;
      throw new CollaborationRecoveryError('unavailable');
    }
  };
  return {
    async inspect(signal?: AbortSignal): Promise<CollaborationRecoveryPlan> {
      const value = await request('GET', signal);
      if (!record(value) || !/^[a-f0-9]{64}$/.test(typeof value.sha256 === 'string' ? value.sha256 : '')
        || typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > 5 * 1024 * 1024
        || !revisionValid(value.revision)) throw new CollaborationRecoveryError('unavailable');
      return { sha256: value.sha256 as string, bytes: value.bytes, revision: value.revision };
    },
    async recover(plan: CollaborationRecoveryPlan, signal?: AbortSignal): Promise<void> {
      if (!/^[a-f0-9]{64}$/.test(plan.sha256) || !revisionValid(plan.revision)) throw new CollaborationRecoveryError('unavailable');
      const value = await request('POST', signal, JSON.stringify({ sha256: plan.sha256, revision: plan.revision }));
      if (!record(value) || value.backupId !== `${id}.${plan.sha256}.yjs` || value.previousSha256 !== plan.sha256
        || value.revision !== plan.revision) throw new CollaborationRecoveryError('unavailable');
    },
  };
};
