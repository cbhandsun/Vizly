import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logAuthRuntimeStateClearFailure = (error: unknown): void => {
  safeLog.error('Failed to clear auth-sensitive runtime state:', redactSensitiveLogValue(error));
};

export const logCloudAdapterConfigurationFailure = (error: unknown): void => {
  safeLog.error('Failed to configure cloud adapter:', redactSensitiveLogValue(error));
};

export const logAuthInitializationFailure = (error: unknown): void => {
  safeLog.error('Auth initialization failed:', redactSensitiveLogValue(error));
};

export const logAuthProviderFallbackContext = (): void => {
  safeLog.warn('[Auth] useAuth was called outside of an AuthProvider. Returning fallback context.');
};

export const logSubscriptionProviderFallbackContext = (): void => {
  safeLog.warn('[Subscription] useSubscription was called outside of a SubscriptionProvider. Returning fallback context.');
};
