import { supabase } from './supabase';

/** SDK getSession refreshes near expiry under its cross-tab lock, even when its background ticker is paused. */
export async function resolveCollaborationSessionToken(expectedUserId: string | undefined): Promise<string | null> {
  if (!supabase || !expectedUserId) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Collaboration session unavailable');
  let session = data.session;
  if (!session || session.user.id !== expectedUserId) return null;
  if (!session.expires_at || session.expires_at * 1000 <= Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw new Error('Collaboration session unavailable');
    session = refreshed.data.session;
  }
  return session?.user.id === expectedUserId && session.expires_at && session.expires_at * 1000 > Date.now() + 5000
    ? session.access_token : null;
}
