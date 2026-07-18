import { describe, expect, it } from 'vitest';

import { coerceCollaborationPresenceUsers } from '../collaborationPresence';

describe('collaborationPresence', () => {
  it('normalizes bounded collaboration presence values', () => {
    expect(coerceCollaborationPresenceUsers([{
      clientId: 42,
      user: { name: ' Alice ', color: '#AABBCC' },
      cursor: { x: 12.5, y: -20 },
      isLocal: true,
      isIdle: false,
    }])).toEqual([{
      clientId: 42,
      user: { name: 'Alice', color: '#AABBCC' },
      cursor: { x: 12.5, y: -20 },
      isLocal: true,
      isIdle: false,
    }]);
  });

  it('rejects invalid identities and strips unsafe optional values', () => {
    expect(coerceCollaborationPresenceUsers([
      null,
      { clientId: -1, user: { name: 'Bad', color: '#000000' } },
      { clientId: 'ok', user: { name: '', color: '#000000' } },
      {
        clientId: 'safe',
        user: { name: 'x'.repeat(100), color: 'url(javascript:bad)' },
        cursor: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
        isIdle: 'yes',
      },
    ])).toEqual([{
      clientId: 'safe',
      user: { name: 'x'.repeat(80), color: '#1890ff' },
    }]);
  });

  it('deduplicates clients and caps work before coercion', () => {
    const input = Array.from({ length: 120 }, (_, index) => ({
      clientId: index % 2 === 0 ? 'same' : `client-${index}`,
      user: { name: `User ${index}`, color: '#123456' },
    }));
    const result = coerceCollaborationPresenceUsers(input);

    expect(result).toHaveLength(51);
    expect(result.find((entry) => entry.clientId === 'same')?.user.name).toBe('User 98');
    expect(result.some((entry) => entry.clientId === 'client-101')).toBe(false);
  });

  it('returns an empty list for non-array external input', () => {
    expect(coerceCollaborationPresenceUsers(undefined)).toEqual([]);
    expect(coerceCollaborationPresenceUsers({ length: 1 })).toEqual([]);
  });
});
