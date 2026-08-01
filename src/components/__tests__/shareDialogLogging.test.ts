import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('shareDialogLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts share dialog load and mutation failures', async () => {
    const logging = await import('../shareDialogLogging');

    logging.logShareDialogLoadFailure('shares', new Error('Authorization: Bearer share-list-secret'));
    logging.logShareDialogLoadFailure('collaborators', new Error('cookie=collab-list-secret'));
    logging.logShareDialogMutationFailure('revokeShare', new Error('token=revoke-secret'));
    logging.logShareDialogMutationFailure('removeCollaborator', new Error('api_key=remove-secret'));
    logging.logShareDialogMutationFailure('createShareLink', new Error('Authorization: Bearer create-secret'));
    logging.logShareDialogMutationFailure('addCollaborator', new Error('cookie=invite-secret'));
    logging.logShareDialogClipboardFailure(new Error('token=clipboard-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[ShareDialog] Failed to load shares:');
    expect(warnPayload).toContain('[ShareDialog] Failed to load collaborators:');
    expect(warnPayload).toContain('[ShareDialog] revokeShare failed:');
    expect(warnPayload).toContain('[ShareDialog] removeCollaborator failed:');
    expect(warnPayload).toContain('[ShareDialog] createShareLink failed:');
    expect(warnPayload).toContain('[ShareDialog] addCollaborator failed:');
    expect(warnPayload).toContain('[ShareDialog] Clipboard write failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('share-list-secret');
    expect(warnPayload).not.toContain('collab-list-secret');
    expect(warnPayload).not.toContain('revoke-secret');
    expect(warnPayload).not.toContain('remove-secret');
    expect(warnPayload).not.toContain('create-secret');
    expect(warnPayload).not.toContain('invite-secret');
    expect(warnPayload).not.toContain('clipboard-secret');
  });
});
