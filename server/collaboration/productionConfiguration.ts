export interface ProductionCollaborationConfiguration {
  supabaseUrl: string;
  publishableKey: string;
  serverKey: string;
  origins: ReadonlySet<string>;
}
const invalid = () => new Error('Invalid production collaboration configuration');
const httpsOrigin = (input: unknown): string => {
  if (typeof input !== 'string' || input.length > 2048) throw invalid();
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw invalid(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || parsed.pathname !== '/' || parsed.origin !== input.replace(/\/$/, '')) throw invalid();
  return parsed.origin;
};
const publicKey = (input: unknown): string => {
  if (typeof input !== 'string' || input.length > 4096) throw invalid();
  if (/^sb_publishable_[A-Za-z0-9_-]{8,512}$/.test(input)) return input;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input)) throw invalid();
  try {
    const payload: unknown = JSON.parse(Buffer.from(input.split('.')[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || !('role' in payload) || payload.role !== 'anon') throw invalid();
  } catch { throw invalid(); }
  return input;
};
/** Browser/public and backend/secret credentials stay distinct at the runtime boundary. */
export const parseProductionCollaborationConfiguration = (environment: Record<string, unknown>): ProductionCollaborationConfiguration => {
  const supabaseUrl = httpsOrigin(environment.SUPABASE_URL);
  const publishableKey = publicKey(environment.SUPABASE_PUBLISHABLE_KEY);
  const serverKey = environment.SUPABASE_SERVER_KEY;
  if (typeof serverKey !== 'string' || !/^sb_secret_[A-Za-z0-9_-]{8,512}$/.test(serverKey)) throw invalid();
  const rawOrigins = environment.VIZLY_COLLABORATION_ORIGINS;
  if (typeof rawOrigins !== 'string' || rawOrigins.length > 8192) throw invalid();
  const values = rawOrigins.split(',');
  if (values.length < 1 || values.length > 16 || values.some(value => value !== value.trim() || value.endsWith('/'))) throw invalid();
  const origins = new Set(values.map(httpsOrigin));
  return { supabaseUrl, publishableKey, serverKey, origins };
};
