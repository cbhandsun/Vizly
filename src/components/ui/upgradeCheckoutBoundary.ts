import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

const MAX_CHECKOUT_ERROR_CHARS = 500;

export const normalizeUpgradeCheckoutError = (
  error: unknown,
  fallback: string,
): string => {
  const rawMessage = error instanceof Error ? error.message : error;
  const redacted = redactSensitiveLogValue(rawMessage);
  if (typeof redacted !== 'string') return fallback;

  const normalized = redacted
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, MAX_CHECKOUT_ERROR_CHARS);
  return normalized || fallback;
};
