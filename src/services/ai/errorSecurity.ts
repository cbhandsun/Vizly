import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

const DEFAULT_MAX_LENGTH = 240;

export function sanitizeAIProviderError(value: unknown, maxLength: number = DEFAULT_MAX_LENGTH): string {
    const raw = value instanceof Error ? value.message : String(value ?? '');
    const redacted = String(redactSensitiveLogValue(raw));
    return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}...` : redacted;
}
