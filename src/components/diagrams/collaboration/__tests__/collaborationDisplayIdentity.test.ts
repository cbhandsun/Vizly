import { describe, expect, it } from 'vitest';
import { resolveAuthenticatedCollaboratorIdentity } from '../collaborationDisplayIdentity';

describe('authenticated collaborator display identity', () => {
  it('matches the opaque server identity without publishing email or account metadata', () => {
    expect(resolveAuthenticatedCollaboratorIdentity('23c11572-1234-4567-89ab-123456789abc'))
      .toEqual({ name: 'User 23c11572', color: '#0ea5e9' });
    expect(resolveAuthenticatedCollaboratorIdentity('ABCDEF12-1234-4567-89AB-123456789ABC')?.name)
      .toBe('User abcdef12');
  });
  it.each([undefined, null, '', ' ', 12, {}, [], 'user@example.com', '<script>alert(1)</script>',
    'a'.repeat(10000), '23c11572-1234-4567-89ab-123456789abc\n'])('rejects invalid input %j', value => {
    expect(resolveAuthenticatedCollaboratorIdentity(value)).toBeNull();
  });
});
