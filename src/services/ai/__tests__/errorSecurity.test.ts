import { describe, expect, it } from 'vitest';
import { sanitizeAIProviderError } from '../errorSecurity';

describe('AI provider error security', () => {
    it('redacts secrets from provider and proxy errors before UI persistence', () => {
        const result = sanitizeAIProviderError(
            'upstream failed Authorization: Bearer live-token api_key=sk-live-secret-value token=callback-secret'
        );

        expect(result).toContain('Authorization: [redacted]');
        expect(result).toContain('api_key=[redacted]');
        expect(result).toContain('token=[redacted]');
        expect(result).not.toContain('live-token');
        expect(result).not.toContain('sk-live-secret-value');
        expect(result).not.toContain('callback-secret');
    });

    it('handles Error objects and applies a caller-provided length cap', () => {
        const result = sanitizeAIProviderError(
            new Error(`AWS4-HMAC-SHA256 Credential=AKIA_TEST/20260613 Signature=abcdef1234 ${'x'.repeat(40)}`),
            64
        );

        expect(result).toContain('Credential=[redacted]');
        expect(result).toContain('Signature=[redacted]');
        expect(result.length).toBeLessThanOrEqual(67);
    });
});
