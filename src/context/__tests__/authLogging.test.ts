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

describe('authLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values before logging auth failures', async () => {
    const {
      logAuthInitializationFailure,
      logAuthRuntimeStateClearFailure,
      logCloudAdapterConfigurationFailure,
      logAuthProviderFallbackContext,
      logSubscriptionProviderFallbackContext,
    } = await import('../authLogging');

    logAuthRuntimeStateClearFailure(new Error('Authorization: Bearer auth-secret'));
    logCloudAdapterConfigurationFailure({ token: 'cloud-secret-token' });
    logAuthInitializationFailure(new Error('api_key=test-auth-key'));
    logAuthProviderFallbackContext();
    logSubscriptionProviderFallbackContext();

    const payload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(payload).toContain('Failed to clear auth-sensitive runtime state:');
    expect(payload).toContain('Failed to configure cloud adapter:');
    expect(payload).toContain('Auth initialization failed:');
    expect(warnPayload).toContain('[Auth] useAuth was called outside of an AuthProvider. Returning fallback context.');
    expect(warnPayload).toContain('[Subscription] useSubscription was called outside of a SubscriptionProvider. Returning fallback context.');
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('auth-secret');
    expect(payload).not.toContain('cloud-secret-token');
    expect(payload).not.toContain('test-auth-key');
  });
});
