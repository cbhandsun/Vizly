import { createClient } from '@supabase/supabase-js';
import { isRecord } from './boundary.js';
import { retryTransientFetch } from './retryTransientFetch.js';

export interface DiagramPermission { userId: string; role: 'editor' | 'viewer' }
export type AuthorizeDiagram = (token: string, diagramId: string) => Promise<DiagramPermission | null>;

/** Each check uses a fresh user-scoped client. No service-role bypass or client role claims. */
const createAuthorizer = (url: string, publishableKey: string, fetchImpl: typeof fetch, ownerOnly: boolean): AuthorizeDiagram => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !publishableKey) throw new Error('Invalid collaboration Auth configuration');
  return async (token, diagramId) => {
    const deadline = AbortSignal.timeout(5000);
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) => retryTransientFetch(fetchImpl, input, init ?? {},
          init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline),
      },
    });
    // A decoded subject only narrows the database query. It never grants access:
    // the result must match this request's fresh, verified Auth response below.
    // Both HTTPS requests remain user-scoped and get a shared bounded deadline.
    let subjectHint: string | undefined;
    if (token.length <= 16_384 && token.split('.').length === 3) {
      try {
        const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        if (isRecord(payload) && typeof payload.sub === 'string'
          && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.sub)) {
          subjectHint = payload.sub;
        }
      } catch { /* Opaque/legacy inputs still require normal server verification. */ }
    }
    if (subjectHint) {
      const identity = client.auth.getUser(token);
      const query = client.from('diagrams')
        .select(ownerOnly ? 'user_id' : 'user_id,diagram_collaborators(user_id,role)')
        .eq('id', diagramId);
      if (!ownerOnly) query.eq('diagram_collaborators.user_id', subjectHint);
      const [{ data: auth, error: authError }, { data: diagram, error }] = await Promise.all([identity, query.maybeSingle()]);
      if (deadline.aborted || (authError && (authError.status === 0 || (authError.status ?? 0) >= 500))
        || error && (!error.code || error.code === '57014')) throw new Error('Collaboration authorization unavailable');
      if (authError || !auth.user || auth.user.is_anonymous || auth.user.id !== subjectHint
        || error || !isRecord(diagram)) return null;
      if (diagram.user_id === auth.user.id) return { userId: auth.user.id, role: 'editor' };
      if (ownerOnly) return null;
      const members: unknown = diagram.diagram_collaborators;
      if (!Array.isArray(members) || members.length !== 1 || !isRecord(members[0])
        || members[0].user_id !== auth.user.id) return null;
      const role = members[0].role;
      return role === 'viewer' ? { userId: auth.user.id, role }
        : role === 'editor' || role === 'owner' ? { userId: auth.user.id, role: 'editor' } : null;
    }
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user || auth.user.is_anonymous || typeof auth.user.id !== 'string') return null;
    const { data: diagram, error } = await client.from('diagrams').select('user_id').eq('id', diagramId).maybeSingle();
    if (error || !isRecord(diagram)) return null;
    if (diagram.user_id === auth.user.id) return { userId: auth.user.id, role: 'editor' };
    if (ownerOnly) return null;
    const { data: collaborator, error: roleError } = await client.from('diagram_collaborators').select('role')
      .eq('diagram_id', diagramId).eq('user_id', auth.user.id).maybeSingle();
    if (roleError || !isRecord(collaborator)) return null;
    const role = collaborator.role;
    return role === 'viewer' ? { userId: auth.user.id, role } : role === 'editor' || role === 'owner'
      ? { userId: auth.user.id, role: 'editor' } : null;
  };
};

export const createSupabaseAuthorizer = (url: string, publishableKey: string, fetchImpl: typeof fetch = fetch): AuthorizeDiagram =>
  createAuthorizer(url, publishableKey, fetchImpl, false);

/** Recovery authority comes exclusively from diagrams.user_id, never a collaborator role. */
export const createSupabaseOwnerAuthorizer = (url: string, publishableKey: string, fetchImpl: typeof fetch = fetch): AuthorizeDiagram =>
  createAuthorizer(url, publishableKey, fetchImpl, true);
