import { beforeEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: { warn },
}));

import {
  DEFAULT_WORKSPACE_DISPLAY_PREFERENCES,
  WORKSPACE_DISPLAY_PREFERENCES_STORAGE_KEY,
  coerceWorkspaceDisplayPreferences,
  parseWorkspaceDisplayPreferences,
  readWorkspaceDisplayPreferences,
  writeWorkspaceDisplayPreferences,
  type WorkspaceDisplayPreferencesStorage,
} from '../workspaceDisplayPreferences';

describe('workspaceDisplayPreferences', () => {
  beforeEach(() => {
    warn.mockReset();
  });

  it('parses valid persisted preferences and ignores unknown fields', () => {
    expect(parseWorkspaceDisplayPreferences(JSON.stringify({
      version: 1,
      viewMode: 'list',
      sortKey: 'name',
      futureField: 'ignored',
    }))).toEqual({ version: 1, viewMode: 'list', sortKey: 'name' });
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    '{not-json',
    '[]',
    'null',
    JSON.stringify({ version: 2, viewMode: 'list', sortKey: 'name' }),
    JSON.stringify({ version: 1, viewMode: 'tiles', sortKey: 'name' }),
    JSON.stringify({ version: 1, viewMode: 'list', sortKey: 'created' }),
    JSON.stringify({ version: 1, viewMode: 1, sortKey: true }),
    'x'.repeat(513),
  ])('falls back for empty, malformed, incompatible, or extreme input %#', value => {
    expect(parseWorkspaceDisplayPreferences(value)).toBe(DEFAULT_WORKSPACE_DISPLAY_PREFERENCES);
  });

  it('coerces hostile objects without reading inherited preference values', () => {
    const hostile = Object.create({ version: 1, viewMode: 'list', sortKey: 'type' }) as unknown;
    expect(coerceWorkspaceDisplayPreferences(hostile)).toBe(DEFAULT_WORKSPACE_DISPLAY_PREFERENCES);

    expect(coerceWorkspaceDisplayPreferences({
      version: 1,
      viewMode: 'list',
      sortKey: 'type',
      __proto__: { polluted: true },
    })).toEqual({ version: 1, viewMode: 'list', sortKey: 'type' });
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('reads from the bounded storage key and safely handles unavailable storage', () => {
    const storage: WorkspaceDisplayPreferencesStorage = {
      getItem: vi.fn(() => JSON.stringify({ version: 1, viewMode: 'list', sortKey: 'type' })),
      setItem: vi.fn(),
    };

    expect(readWorkspaceDisplayPreferences(() => storage)).toEqual({
      version: 1,
      viewMode: 'list',
      sortKey: 'type',
    });
    expect(storage.getItem).toHaveBeenCalledWith(WORKSPACE_DISPLAY_PREFERENCES_STORAGE_KEY);
    expect(readWorkspaceDisplayPreferences(() => null)).toBe(DEFAULT_WORKSPACE_DISPLAY_PREFERENCES);
  });

  it('sanitizes storage read failures without logging stored values', () => {
    const secret = 'cookie=workspace-secret';
    const storage: WorkspaceDisplayPreferencesStorage = {
      getItem: vi.fn(() => { throw new Error(secret); }),
      setItem: vi.fn(),
    };

    expect(readWorkspaceDisplayPreferences(() => storage)).toBe(DEFAULT_WORKSPACE_DISPLAY_PREFERENCES);
    const payload = JSON.stringify(warn.mock.calls);
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('workspace-secret');
  });

  it('writes only validated fields and survives quota and provider failures', () => {
    const storage: WorkspaceDisplayPreferencesStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };
    expect(writeWorkspaceDisplayPreferences(
      { version: 1, viewMode: 'list', sortKey: 'name' },
      () => storage,
    )).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      WORKSPACE_DISPLAY_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, viewMode: 'list', sortKey: 'name' }),
    );

    const quotaStorage: WorkspaceDisplayPreferencesStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(() => { throw new Error('token=quota-secret'); }),
    };
    expect(writeWorkspaceDisplayPreferences(
      { version: 1, viewMode: 'grid', sortKey: 'updated' },
      () => quotaStorage,
    )).toBe(false);
    expect(writeWorkspaceDisplayPreferences(
      { version: 1, viewMode: 'grid', sortKey: 'updated' },
      () => { throw new Error('Bearer provider-secret'); },
    )).toBe(false);
    const payload = JSON.stringify(warn.mock.calls);
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('quota-secret');
    expect(payload).not.toContain('provider-secret');
  });
});
