import { createClient } from '@supabase/supabase-js';
import { isRecord } from './boundary.js';

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
        fetch: (input, init) => fetchImpl(input, { ...init, signal: init?.signal
          ? AbortSignal.any([init.signal, deadline]) : deadline }),
      },
    });
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
