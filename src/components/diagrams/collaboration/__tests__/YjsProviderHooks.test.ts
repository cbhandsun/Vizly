import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('yjs', () => ({}));
vi.mock('y-websocket', () => ({
  WebsocketProvider: class {},
}));
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({}),
}));

import {
  STORAGE_KEY_COLOR,
  STORAGE_KEY_NAME,
  persistCollaboratorIdentity,
  readStoredCollaboratorIdentity,
} from '../YjsProviderHooks';

describe('YjsProviderHooks storage helpers', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    sessionStorage.clear();
  });

  it('reads stored collaborator identity when both fields exist', () => {
    sessionStorage.setItem(STORAGE_KEY_NAME, 'Guest 1');
    sessionStorage.setItem(STORAGE_KEY_COLOR, '#0ea5e9');

    expect(readStoredCollaboratorIdentity()).toEqual({
      name: 'Guest 1',
      color: '#0ea5e9',
    });
  });

  it('logs and falls back to null when session storage read fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('token=secret-read');
    });

    expect(readStoredCollaboratorIdentity()).toBeNull();
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[YjsProviderHooks.readStoredCollaboratorIdentity] Failed to read "vizly_collaborator_name":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('secret-read');
  });

  it('logs and keeps going when session storage write fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer secret-write');
    });

    expect(() => persistCollaboratorIdentity({ name: 'Guest 2', color: '#10b981' })).not.toThrow();
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[YjsProviderHooks.persistCollaboratorIdentity] Failed to write "vizly_collaborator_name":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('secret-write');
  });
});
