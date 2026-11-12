import { afterEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: { auth } }));
import { resolveCollaborationSessionToken } from '../collaborationSession';
afterEach(() => vi.resetAllMocks());
const session = (token: string, seconds: number, id = 'owner') => ({ access_token: token, expires_at: Date.now() / 1000 + seconds, user: { id } });
it('reads current SDK session for every handshake instead of a captured token', async () => {
 auth.getSession.mockResolvedValueOnce({ data: { session: session('first',3600) } }).mockResolvedValueOnce({ data: { session: session('second',3600) } });
 expect(await resolveCollaborationSessionToken('owner')).toBe('first');
 expect(await resolveCollaborationSessionToken('owner')).toBe('second'); expect(auth.refreshSession).not.toHaveBeenCalled();
});
it('refreshes near-expired credentials even when the browser auto-refresh ticker is paused', async () => {
 auth.getSession.mockResolvedValue({ data: { session: session('expired',-1) } });
 auth.refreshSession.mockResolvedValue({ data: { session: session('fresh',3600) } });
 expect(await resolveCollaborationSessionToken('owner')).toBe('fresh'); expect(auth.refreshSession).toHaveBeenCalledTimes(1);
});
it('never connects with a different account after sign-out/account switch races', async () => {
 auth.getSession.mockResolvedValue({ data: { session: session('expired',-1) } });
 auth.refreshSession.mockResolvedValue({ data: { session: session('different',3600,'other') } });
 expect(await resolveCollaborationSessionToken('owner')).toBeNull();
});
it('keeps a transient refresh failure out of the WebSocket handshake', async () => {
 auth.getSession.mockResolvedValue({ data: { session: session('expired',-1) } });
 auth.refreshSession.mockResolvedValue({ error: new Error('private provider detail') });
 await expect(resolveCollaborationSessionToken('owner')).rejects.toThrow('Collaboration session unavailable');
});
