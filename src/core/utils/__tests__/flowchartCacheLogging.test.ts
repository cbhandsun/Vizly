// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('flowchartCacheLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts cache clear failures', async () => {
    const logging = await import('../flowchartCacheLogging');

    logging.logFlowchartCacheClearFailure('localStorage', 'flowchart.layers', new Error('Authorization: Bearer cache-secret'));
    logging.logFlowchartCacheClearFailure('sessionStorage', 'layered-config-session', new Error('cookie=session-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[clearFlowchartCache] Failed to clear localStorage key "flowchart.layers":');
    expect(warnMessages).toContain('[clearFlowchartCache] Failed to clear sessionStorage key "layered-config-session":');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('cache-secret');
    expect(warnPayload).not.toContain('session-secret');
  });
});
