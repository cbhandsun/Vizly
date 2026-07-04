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

describe('flowchartOnboardingStorage', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach((mock) => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('reads dismissed state from storage and defaults to false', async () => {
    const {
      FLOWCHART_ONBOARDING_DISMISSED_STORAGE_KEY,
      readFlowchartOnboardingDismissed,
    } = await import('../flowchartOnboardingStorage');

    expect(readFlowchartOnboardingDismissed({
      getItem: vi.fn().mockReturnValue(null),
    })).toBe(false);

    expect(readFlowchartOnboardingDismissed({
      getItem: vi.fn().mockReturnValue('1'),
    })).toBe(true);

    expect(FLOWCHART_ONBOARDING_DISMISSED_STORAGE_KEY).toBe('designer.flowchart.onboarding.dismissed');
  });

  it('logs a redacted warning when reading dismissed state fails', async () => {
    const { readFlowchartOnboardingDismissed } = await import('../flowchartOnboardingStorage');

    expect(readFlowchartOnboardingDismissed({
      getItem: vi.fn(() => {
        throw new Error('Authorization: Bearer onboarding-read-secret');
      }),
    })).toBe(false);

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[FlowchartDesigner] Failed to read onboarding dismissal state:',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('onboarding-read-secret');
  });

  it('logs a redacted warning when persisting dismissed state fails', async () => {
    const { persistFlowchartOnboardingDismissed } = await import('../flowchartOnboardingStorage');

    persistFlowchartOnboardingDismissed({
      setItem: vi.fn(() => {
        throw new Error('cookie=onboarding-write-secret');
      }),
    });

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[FlowchartDesigner] Failed to persist onboarding dismissal state:',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('onboarding-write-secret');
  });
});
