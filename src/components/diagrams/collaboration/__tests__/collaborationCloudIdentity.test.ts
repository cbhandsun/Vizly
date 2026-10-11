import { describe, expect, it } from 'vitest';
import { hasSupabaseCollaborationIdentity } from '../collaborationCloudIdentity';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const valid = () => ({ id, metadata: { cloud: { provider: 'supabase', id } } });

describe('Supabase collaboration document identity', () => {
  it('recognizes a matching document without changing its metadata', () => {
    const bridge = Object.freeze({ id, metadata: Object.freeze({ cloud: Object.freeze({ provider: 'supabase', id }) }) });
    expect(hasSupabaseCollaborationIdentity(bridge, id)).toBe(true);
    expect(bridge).toEqual(valid());
  });
  it.each([undefined, null, [], 42, '', 'x'.repeat(10000)])('rejects invalid active identifiers', value => {
    expect(hasSupabaseCollaborationIdentity(valid(), value)).toBe(false);
  });
  it.each([undefined, null, [], {}, { id }, { id, metadata: [] }, { id, metadata: { cloud: null } },
    { id, metadata: { cloud: { provider: 's3', id } } }, { id, metadata: { cloud: { provider: 'supabase', id: 'other' } } },
    { id: 'other', metadata: { cloud: { provider: 'supabase', id } } }])('rejects missing, malformed and foreign identities', value => {
    expect(hasSupabaseCollaborationIdentity(value, id)).toBe(false);
  });
  it('does not accept inherited fields or invoke accessor payloads', () => {
    expect(hasSupabaseCollaborationIdentity(Object.create(valid()), id)).toBe(false);
    expect(hasSupabaseCollaborationIdentity({ id, metadata: Object.create(valid().metadata) }, id)).toBe(false);
    expect(hasSupabaseCollaborationIdentity({ id, metadata: { get cloud() { throw new Error('Getter must not run'); } } }, id)).toBe(false);
  });
  it('does not hide unexpected bridge inspection failures', () => {
    const failure = new Error('Bridge unavailable');
    const bridge = new Proxy({}, { getOwnPropertyDescriptor() { throw failure; } });
    expect(() => hasSupabaseCollaborationIdentity(bridge, id)).toThrow(failure);
  });
});
