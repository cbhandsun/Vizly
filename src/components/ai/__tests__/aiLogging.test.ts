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

describe('aiLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values before logging AI config and command failures', async () => {
    const {
      logAIChatCancelFailure,
      logAIChatCloudConfigLoadFailure,
      logAIChatConversationSyncFailure,
      logAIChatEndpointValidationFailure,
      logAIChatInvalidDiagramSavePayload,
      logAIChatLocalIndexPersistFailure,
      logAIConfigEndpointValidationFailure,
      logAIConfigRequestFailure,
      logAICommandExecutionError,
      logAIConfigCloudSaveFailure,
      logAIConfigModalCloudLoadFailure,
      logAIConfigStorageFailure,
      logBlockedAutonomousCommand,
    } = await import('../aiLogging');

    logAIConfigModalCloudLoadFailure(new Error('Authorization: Bearer ai-modal-secret'));
    logAIConfigCloudSaveFailure({ apiKey: 'save-secret' });
    logAIConfigStorageFailure('parseStoredAIConfig', new Error('token=ai-storage-secret'));
    logAIConfigEndpointValidationFailure('Anthropic', 'testConnection', new Error('cookie=ai-config-endpoint-secret'));
    logAIConfigRequestFailure('fetchModels', 'OpenAI', new Error('secret=ai-config-request-secret'));
    logAIChatCloudConfigLoadFailure(new Error('token=chat-secret'));
    logAIChatConversationSyncFailure(new Error('token=conversation-sync-secret'));
    logAIChatEndpointValidationFailure('OpenAI', new Error('cookie=endpoint-secret'));
    logAIChatCancelFailure(new Error('secret=cancel-secret'));
    logAIChatInvalidDiagramSavePayload(new Error('password=invalid-payload-secret'));
    logAIChatLocalIndexPersistFailure(new Error('credential=index-secret'));
    logBlockedAutonomousCommand('deleteAll', 'requires api_key=policy-secret');
    logAICommandExecutionError(
      new Error('credential=cmd-secret'),
      { action: 'save', token: 'command-secret' }
    );

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const errorMessages = safeLogState.error.mock.calls.map(call => String(call[0]));
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(errorPayload).toContain('AIConfigModal: Failed to load cloud config');
    expect(errorPayload).toContain('Cloud save failed');
    expect(errorMessages).toContain('[AIConfigModal] fetchModels failed for "OpenAI":');
    expect(errorPayload).toContain('AIChatPanel: Failed to load cloud AI config');
    expect(errorPayload).toContain('[AI Pilot] Command execution error:');
    expect(warnMessages).toContain('[aiConfigStorage] parseStoredAIConfig failed:');
    expect(warnMessages).toContain('[AIConfigModal] testConnection endpoint validation failed for "Anthropic":');
    expect(warnMessages).toContain('[AIChatPanel] Invalid endpoint for provider "OpenAI":');
    expect(warnMessages).toContain('[AIChatPanel] Stream cancel failed:');
    expect(warnMessages).toContain('[AIChatPanel] Failed to synchronize conversations:');
    expect(warnMessages).toContain('[AIChatPanel] Invalid AI diagram payload for save:');
    expect(warnMessages).toContain('[AIChatPanel] Failed to persist local diagram index:');
    expect(warnPayload).toContain('[AI Pilot] Blocked autonomous command:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('ai-modal-secret');
    expect(errorPayload).not.toContain('save-secret');
    expect(errorPayload).not.toContain('ai-config-request-secret');
    expect(errorPayload).not.toContain('chat-secret');
    expect(errorPayload).not.toContain('cmd-secret');
    expect(errorPayload).not.toContain('command-secret');
    expect(warnPayload).not.toContain('endpoint-secret');
    expect(warnPayload).not.toContain('ai-config-endpoint-secret');
    expect(warnPayload).not.toContain('ai-storage-secret');
    expect(warnPayload).not.toContain('cancel-secret');
    expect(warnPayload).not.toContain('conversation-sync-secret');
    expect(warnPayload).not.toContain('invalid-payload-secret');
    expect(warnPayload).not.toContain('index-secret');
    expect(warnPayload).not.toContain('policy-secret');
  });
});
