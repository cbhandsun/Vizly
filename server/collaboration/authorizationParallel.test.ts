// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createSupabaseAuthorizer, createSupabaseOwnerAuthorizer } from './authorization.js';
const user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const diagram = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ sub: user,
  user_metadata: { role: 'owner' } })).toString('base64url') + '.synthetic-signature';
const json = (value: unknown, status = 200) => Response.json(value, { status });
it('starts the user-scoped role read concurrently but grants nothing before fresh verified identity', async () => {
  let finish!: (response: Response) => void;
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ' + token);
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return new Promise<Response>(resolve => { finish = resolve; });
    expect(url.pathname).toBe('/rest/v1/diagrams');
    expect(url.searchParams.get('diagram_collaborators.user_id')).toBe('eq.' + user);
    return json({ user_id: other, diagram_collaborators: [{ user_id: user, role: 'editor' }] });
  });
  let settled = false;
  const pending = createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport)(token, diagram)
    .then(value => { settled = true; return value; });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  expect(settled).toBe(false);
  finish(json({ id: user, is_anonymous: false }));
  expect(await pending).toEqual({ userId: user, role: 'editor' });
});
it('freshly observes revocation without reusing a positive role or identity', async () => {
  let member = true;
  const transport = vi.fn<typeof fetch>(async input => new URL(String(input)).pathname === '/auth/v1/user'
    ? json({ id: user, is_anonymous: false })
    : json({ user_id: other, diagram_collaborators: member ? [{ user_id: user, role: 'editor' }] : [] }));
  const authorize = createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport);
  expect(await authorize(token, diagram)).toEqual({ userId: user, role: 'editor' });
  member = false;
  expect(await authorize(token, diagram)).toBeNull();
  expect(transport).toHaveBeenCalledTimes(4);
});
it.each([
  { identity: { id: other }, status: 200 },
  { identity: { id: user, is_anonymous: true }, status: 200 },
  { identity: {}, status: 200 },
  { identity: { message: 'invalid JWT' }, status: 401 },
])('rejects unverified or mismatching identity despite an elevated database result: $status', async ({ identity, status }) => {
  const transport = vi.fn<typeof fetch>(async input => new URL(String(input)).pathname === '/auth/v1/user'
    ? json(identity, status) : json({ user_id: user, diagram_collaborators: [] }));
  expect(await createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport)(token, diagram)).toBeNull();
});
it.each([
  { members: [{ user_id: other, role: 'owner' }] },
  { members: [{ user_id: user, role: 'admin' }] },
  { members: [{ user_id: user, role: 'editor' }, { user_id: user, role: 'editor' }] },
  { members: null },
])('rejects unrelated, malformed or ambiguous nested membership %#', async ({ members }) => {
  const transport = vi.fn<typeof fetch>(async input => new URL(String(input)).pathname === '/auth/v1/user'
    ? json({ id: user, is_anonymous: false }) : json({ user_id: other, diagram_collaborators: members }));
  expect(await createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport)(token, diagram)).toBeNull();
});
it.each(['viewer', 'editor'] as const)('derives %s only from its matching database membership', async role => {
  const transport = vi.fn<typeof fetch>(async input => new URL(String(input)).pathname === '/auth/v1/user'
    ? json({ id: user, is_anonymous: false, user_metadata: { role: 'owner' } })
    : json({ user_id: other, diagram_collaborators: [{ user_id: user, role }] }));
  expect(await createSupabaseAuthorizer('https://project.example.com', 'publishable-test', transport)(token, diagram))
    .toEqual({ userId: user, role });
});
it.each([user, other])('keeps recovery restricted to actual ownership: %s', async owner => {
  const transport = vi.fn<typeof fetch>(async input => new URL(String(input)).pathname === '/auth/v1/user'
    ? json({ id: user, is_anonymous: false }) : json({ user_id: owner }));
  expect(await createSupabaseOwnerAuthorizer('https://project.example.com', 'publishable-test', transport)(token, diagram))
    .toEqual(owner === user ? { userId: user, role: 'editor' } : null);
  expect(transport).toHaveBeenCalledTimes(2);
});
