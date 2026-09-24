import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@vizly/core/logging', async (importOriginal) => ({
  ...await importOriginal<typeof import('@vizly/core/logging')>(), safeLog: safeLogState }));

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
