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

describe('flowchartDesignerLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts onboarding storage failures', async () => {
    const logging = await import('../flowchartDesignerLogging');

    logging.logFlowchartDesignerOnboardingStorageReadFailure(new Error('Authorization: Bearer onboarding-read-secret'));
    logging.logFlowchartDesignerOnboardingStorageWriteFailure(new Error('cookie=onboarding-write-secret'));
    logging.logFlowchartDesignerMermaidImportFailure(new Error('api_key=mermaid-import-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    const errorMessages = safeLogState.error.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[FlowchartDesigner] Failed to read onboarding dismissal state:');
    expect(warnMessages).toContain('[FlowchartDesigner] Failed to persist onboarding dismissal state:');
    expect(errorMessages).toContain('[FlowchartDesigner] Mermaid import failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('onboarding-read-secret');
    expect(warnPayload).not.toContain('onboarding-write-secret');
    expect(errorPayload).not.toContain('mermaid-import-secret');
  });
});
