// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAuthorizer, createSupabaseOwnerAuthorizer } from './authorization.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
describe('Supabase verified identity and RLS authorization', () => {
  it.each([true, false])('allows recovery only for the actual diagram owner: %s', async ownsDiagram => {
    const transport = vi.fn<typeof fetch>(async input => String(input).includes('/auth/v1/user')
      ? response({ id: 'verified-user', is_anonymous: false, user_metadata: { role: 'owner' } })
      : response({ user_id: ownsDiagram ? 'verified-user' : 'other-user', role: 'owner' }));
    const permission = await createSupabaseOwnerAuthorizer('https://project.example.com', 'publishable-test', transport)('synthetic-session', id);
    expect(permission).toEqual(ownsDiagram ? { userId: 'verified-user', role: 'editor' } : null);
    expect(transport.mock.calls.length).toBe(2);
    expect(transport.mock.calls.some(([input]) => String(input).includes('diagram_collaborators'))).toBe(false);
  });
  it.each(['owner', 'editor', 'viewer', 'outsider'] as const)('derives %s access from verified Auth and user-scoped database responses', async role => {
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-session');
      if (url.includes('/auth/v1/user')) return response({ id: 'verified-user', is_anonymous: false, user_metadata: { role: 'owner' } });
      if (url.includes('/rest/v1/diagrams?')) return response({ user_id: role === 'owner' ? 'verified-user' : 'other-user' });
      return response(role === 'outsider' ? null : { role });
    });
    const authorize = createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport);
    expect(await authorize('synthetic-session', id)).toEqual(role === 'outsider' ? null : { userId: 'verified-user', role: role === 'owner' ? 'editor' : role });
    expect(transport.mock.calls.length).toBe(role === 'owner' ? 2 : 3);
  });
  it('rejects missing, anonymous or failed identity before querying diagram access', async () => {
    for (const user of [{}, { id: 'anonymous', is_anonymous: true }]) {
      const transport = vi.fn<typeof fetch>(async () => response(user));
      const authorize = createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport);
      expect(await authorize('synthetic-session', id)).toBeNull();
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it('does not accept elevated client metadata or unknown roles when the database denies access', async () => {
    const transport = vi.fn<typeof fetch>(async input => String(input).includes('/auth/v1/user')
      ? response({ id: 'verified-user', user_metadata: { role: 'owner' } })
      : String(input).includes('/rest/v1/diagrams?') ? response(null) : response({ role: 'owner' }));
    expect(await createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport)('synthetic-session', id)).toBeNull();
  });
  it('rejects unsafe Auth configuration before making requests', () => {
    for (const url of ['http://project.example.com', 'https://user:pass@project.example.com', 'https://project.example.com?key=value']) {
      expect(() => createSupabaseAuthorizer(url, 'publishable-test')).toThrow('Invalid collaboration Auth configuration');
    }
  });
});
