import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/core/utils/consoleCleanup', () => ({ safeLog: safeLogState }));

describe('standardFlowPluginLogging', () => {
  beforeEach(() => safeLogState.error.mockReset());

  it('redacts secrets from template loading failures', async () => {
    const { logStandardFlowTemplateLoadFailure } = await import('../standardFlowPluginLogging');

    logStandardFlowTemplateLoadFailure(new Error('Authorization: Bearer template-secret'));

    const payload = JSON.stringify(safeLogState.error.mock.calls);
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('template-secret');
  });
});
