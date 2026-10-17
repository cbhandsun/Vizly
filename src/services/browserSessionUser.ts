import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Client identity precheck only. Every data/RPC operation still enforces RLS. */
export const getBrowserSessionUser = async (client: SupabaseClient) => {
    const { data, error } = await client.auth.getSession();
    if (error) return { data: { user: null }, error };
    const session = data.session;
    const user: User | null = session && typeof session.access_token === 'string'
        && session.access_token.length > 0 && typeof session.user?.id === 'string'
        && session.user.id.length > 0
        && (session.expires_at === undefined || session.expires_at > Date.now() / 1000)
        ? session.user : null;
    return { data: { user }, error: null };
};
