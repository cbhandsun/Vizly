import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrowserSessionUser } from '../browserSessionUser';

describe('browser identity precheck', () => {
    it('uses a local session without a remote getUser request', async () => {
        const getUser = vi.fn();
        const getSession = vi.fn(async () => ({ data: { session: { access_token: 'synthetic', user: { id: 'user-1' }, expires_at: Date.now() / 1000 + 60 } }, error: null }));
        const client = { auth: { getSession, getUser } } as unknown as SupabaseClient;
        await expect(getBrowserSessionUser(client)).resolves.toMatchObject({ data: { user: { id: 'user-1' } }, error: null });
        expect(getSession).toHaveBeenCalledOnce();
        expect(getUser).not.toHaveBeenCalled();
    });
    it.each([null, { user: { id: 'user-1' }, access_token: '' },
        { user: { id: '' }, access_token: 'synthetic' }, { user: { id: 'user-1' }, access_token: 'synthetic', expires_at: 1 }])('rejects unusable local sessions %#', async session => {
        const client = { auth: { getSession: async () => ({ data: { session }, error: null }) } } as unknown as SupabaseClient;
        expect((await getBrowserSessionUser(client)).data.user).toBeNull();
    });
    it('preserves auth refresh errors and transport failures', async () => {
        const error = new Error('controlled refresh failure');
        const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error }) } } as unknown as SupabaseClient;
        expect((await getBrowserSessionUser(client)).error).toBe(error);
        vi.mocked(client.auth.getSession).mockRejectedValue(error);
        await expect(getBrowserSessionUser(client)).rejects.toBe(error);
    });
});
