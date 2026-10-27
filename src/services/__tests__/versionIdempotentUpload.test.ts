// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coerceVersionSnapshotData } from '../versionSnapshotSecurity';
import { hashVersionPayload } from '../versionOutbox';
import { updateAuthSessionOwner } from '../../context/authSessionBoundary';

const fixture = vi.hoisted(() => ({ fetch: vi.fn(), getSession: vi.fn() }));
vi.mock('../supabase', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient('https://version-test.invalid', 'synthetic-anon-key', {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: fixture.fetch },
    });
    vi.spyOn(client.auth, 'getSession').mockImplementation(fixture.getSession);
    return { supabase: client };
});
import { SupabaseStorageProvider } from '../SupabaseStorage';

const owner = '11111111-1111-4111-8111-111111111111';
const diagramId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';
const snapshot = coerceVersionSnapshotData({ nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: {} }], edges: [] });
const operation = async () => ({ ownerId: owner, operationId,
    payloadHash: await hashVersionPayload({ id: operationId, diagramId, snapshotData: snapshot, message: 'saved', createdAt: 1 }) });
const row = () => ({ id: operationId, diagram_id: diagramId, snapshot_data: snapshot, author_id: owner,
    message: 'saved', created_at: '2026-10-26T00:00:00Z' });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
    fixture.fetch.mockReset(); fixture.getSession.mockReset();
    updateAuthSessionOwner(owner, crypto.randomUUID());
    fixture.getSession.mockResolvedValue({ data: { session: { user: { id: owner }, access_token: 'original-synthetic-token' } }, error: null });
});
afterEach(() => updateAuthSessionOwner(null));

describe('idempotent version upload through real Supabase transport', () => {
    it('retries a lost response using the original primary key and verifies the immutable row', async () => {
        let stored: unknown;
        fixture.fetch.mockImplementation(async (_url, init) => {
            if (init.method === 'POST') {
                if (!stored) { stored = JSON.parse(init.body); throw new TypeError('Lost response after commit'); }
                return response({ code: '23505', message: 'duplicate' }, 409);
            }
            return response({ ...stored as object, created_at: row().created_at });
        });
        const provider = new SupabaseStorageProvider(); const input = await operation();
        await expect(provider.saveVersionIdempotent(diagramId, snapshot, 'saved', input)).rejects.toBeDefined();
        await expect(provider.saveVersionIdempotent(diagramId, snapshot, 'saved', input)).resolves.toMatchObject({ id: operationId, authorId: owner });
        expect(fixture.fetch).toHaveBeenCalledTimes(3);
        const writes = fixture.fetch.mock.calls.filter(([, init]) => init.method === 'POST');
        expect(writes.map(([, init]) => JSON.parse(init.body).id)).toEqual([operationId, operationId]);
        for (const [, init] of fixture.fetch.mock.calls) {
            expect(new Headers(init.headers).get('Authorization')).toBe('Bearer original-synthetic-token');
        }
    });
    it.each([{ message: 'different' }, { author_id: other }, { diagram_id: other }, { snapshot_data: { ...snapshot, extra: true } }])('rejects a conflicting immutable row: %j', async patch => {
        fixture.fetch.mockResolvedValueOnce(response({ code: '23505' }, 409)).mockResolvedValueOnce(response({ ...row(), ...patch }));
        await expect(new SupabaseStorageProvider().saveVersionIdempotent(diagramId, snapshot, 'saved', await operation())).rejects.toThrow('conflicts');
        expect(fixture.fetch).toHaveBeenCalledTimes(2);
    });
    it('does not accept an RLS-hidden duplicate as success', async () => {
        fixture.fetch.mockResolvedValueOnce(response({ code: '23505' }, 409)).mockResolvedValueOnce(response({ code: 'PGRST116' }, 406));
        await expect(new SupabaseStorageProvider().saveVersionIdempotent(diagramId, snapshot, 'saved', await operation())).rejects.toMatchObject({ code: 'PGRST116' });
    });
    it('blocks changed payload and accounts before sending', async () => {
        const input = await operation();
        await expect(new SupabaseStorageProvider().saveVersionIdempotent(diagramId, snapshot, 'changed', input)).rejects.toThrow('payload mismatch');
        updateAuthSessionOwner(other);
        await expect(new SupabaseStorageProvider().saveVersionIdempotent(diagramId, snapshot, 'saved', input)).rejects.toThrow('session changed');
        expect(fixture.fetch).not.toHaveBeenCalled();
    });
    it('invalidates an in-flight response after an A/B/A switch', async () => {
        fixture.fetch.mockImplementation(async () => { updateAuthSessionOwner(other); updateAuthSessionOwner(owner); return response(row()); });
        await expect(new SupabaseStorageProvider().saveVersionIdempotent(diagramId, snapshot, 'saved', await operation())).rejects.toThrow('session changed');
    });
    it('rejects a session whose authenticated account differs from the captured owner', async () => {
        fixture.getSession.mockResolvedValue({ data: { session: { user: { id: other }, access_token: 'other-synthetic-token' } }, error: null });
        await expect(new SupabaseStorageProvider().saveVersionIdempotent(diagramId, snapshot, 'saved', await operation())).rejects.toThrow('original authenticated user');
        expect(fixture.fetch).not.toHaveBeenCalled();
    });
});
