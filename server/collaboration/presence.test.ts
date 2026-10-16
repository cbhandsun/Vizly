// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sanitizePresence } from './presence.js';

describe('presence input boundary', () => {
  it('preserves bounded coordinates and replaces untrusted identity and extra fields', () => {
    expect(sanitizePresence({ user: { name: 'forged' }, cursor: { x: -1_000_000, y: 1_000_000, secret: 'omit' }, extra: 'omit' }, 'verified-identity'))
      .toEqual({ user: { name: 'User verified', color: '#0ea5e9' }, cursor: { x: -1_000_000, y: 1_000_000 } });
  });
  it('supports absent cursor, explicit cursor removal and departed members', () => {
    expect(sanitizePresence({}, 'verified')?.cursor).toBeUndefined();
    expect(sanitizePresence({ cursor: null }, 'verified')?.cursor).toBeNull();
    expect(sanitizePresence(null, 'verified')).toBeNull();
  });
  it.each([undefined, [], 'text', { cursor: [] }, { cursor: { x: '1', y: 2 } },
    { cursor: { x: NaN, y: 0 } }, { cursor: { x: Infinity, y: 0 } },
    { cursor: { x: 1_000_001, y: 0 } }, { cursor: { x: 0, y: -1_000_001 } }])('rejects malformed and unbounded input %j', state => {
    expect(() => sanitizePresence(state, 'verified')).toThrow();
  });
});
