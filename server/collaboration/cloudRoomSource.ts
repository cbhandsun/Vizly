import { createClient } from '@supabase/supabase-js';
import { parseRemoteDiagramContent } from '@vizly/core/remote-content';
import { compareCloudCheckpointRevisions } from './roomCheckpoint.js';

const limit = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => new Error('Cloud collaboration source unavailable');
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Read within a stream budget before handing a response to the SDK JSON parser. */
const boundedResponse = async (response: Response): Promise<Response> => {
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel().catch(() => undefined);
    throw unavailable();
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw unavailable();
      chunks.push(next.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw unavailable();
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
};

/** A verified, user-scoped source only. Canvas conversion is a separate Core boundary. */
const createVerifiedClient = (url: string, publishableKey: string, transport: typeof fetch) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !publishableKey) throw unavailable();
  return async (token: unknown, diagramId: unknown, expectedUserId: unknown) => {
    if (typeof token !== 'string' || !token || token.length > 4096 || /\s/.test(token)
      || [...token].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
      || typeof diagramId !== 'string' || !uuid.test(diagramId)
      || typeof expectedUserId !== 'string' || !uuid.test(expectedUserId)) throw unavailable();
    try {
      const deadline = AbortSignal.timeout(5000);
      const client = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` },
          fetch: async (input, init) => boundedResponse(await transport(input, {
            ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
          })),
        },
      });
      const { data: identity, error: identityError } = await client.auth.getUser(token);
      if (identityError || !identity.user || identity.user.is_anonymous || identity.user.id !== expectedUserId) throw unavailable();
      return client;
    } catch { throw unavailable(); }
  };
};

export const createCloudRoomSource = (url: string, publishableKey: string, transport: typeof fetch = fetch) => {
  const verifiedClient = createVerifiedClient(url, publishableKey, transport);
  return async (token: unknown, diagramId: unknown, expectedUserId: unknown) => {
    try {
      const client = await verifiedClient(token, diagramId, expectedUserId);
      if (typeof diagramId !== 'string') throw unavailable();
      // Room initialization has one bounded attempt. Invalid or excessive
      // response streams must not trigger SDK backoff and repeated downloads.
      const { data: row, error } = await client.from('diagrams').select('id,title,content,updated_at')
        .eq('id', diagramId).retry(false).maybeSingle();
      if (error || !record(row) || row.id !== diagramId || typeof row.title !== 'string' || row.title.length > 20_000
        || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw unavailable();
      const content = parseRemoteDiagramContent(row.content, { id: diagramId, title: row.title });
      if (content.nodes.length + (content.groups?.length ?? 0) > 1000 || content.edges.length > 2000) throw unavailable();
      return { diagramId, revision: row.updated_at, content };
    } catch { throw unavailable(); }
  };
};

/** Poll only identity and revision. Do not download graph content on every tick. */
export const createCloudRoomRevisionSource = (url: string, publishableKey: string, transport: typeof fetch = fetch) => {
  const verifiedClient = createVerifiedClient(url, publishableKey, transport);
  return async (token: unknown, diagramId: unknown, expectedUserId: unknown): Promise<string> => {
    try {
      const client = await verifiedClient(token, diagramId, expectedUserId);
      if (typeof diagramId !== 'string') throw unavailable();
      const { data: row, error } = await client.from('diagrams').select('id,updated_at').eq('id', diagramId).retry(false).maybeSingle();
      if (error || !record(row) || row.id !== diagramId || typeof row.updated_at !== 'string') throw unavailable();
      compareCloudCheckpointRevisions(row.updated_at, row.updated_at);
      return row.updated_at;
    } catch { throw unavailable(); }
  };
};
