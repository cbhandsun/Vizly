import { describe, expect, it } from 'vitest';

import {
    createAIProviderConnectionFailure,
    getAIProviderConnectionFeedback,
    getAIProviderConnectionStatus,
    invalidateAIProviderConnectionStatus,
    normalizeAIProviderConnectionStatusMessage,
    setAIProviderConnectionStatus,
    type AIProviderConnectionStatusMap,
} from '../aiProviderConnectionStatus';

describe('aiProviderConnectionStatus', () => {
    it('does not treat complete but untested settings as a successful connection', () => {
        const status = getAIProviderConnectionStatus({}, 'gemini');

        expect(status).toEqual({ kind: 'untested' });
        expect(getAIProviderConnectionFeedback(status)).toEqual({
            tone: 'info',
            messageKey: 'untested',
            role: 'status',
        });
    });

    it('uses success feedback only after an explicit successful request', () => {
        expect(getAIProviderConnectionFeedback({
            kind: 'success',
            operation: 'test-connection',
        })).toMatchObject({ tone: 'success', messageKey: 'verified' });

        expect(getAIProviderConnectionFeedback({
            kind: 'success',
            operation: 'model-sync',
        })).toMatchObject({ tone: 'success', messageKey: 'models-verified' });
    });

    it('keeps connection and model-sync failures persistent and assertive', () => {
        expect(getAIProviderConnectionFeedback(createAIProviderConnectionFailure(
            'test-connection',
            'Unauthorized',
        ))).toEqual({ tone: 'error', messageKey: 'test-failed', role: 'alert' });

        expect(getAIProviderConnectionFeedback(createAIProviderConnectionFailure(
            'model-sync',
            'Timeout',
        ))).toEqual({ tone: 'error', messageKey: 'sync-failed', role: 'alert' });
    });

    it('invalidates a prior result when connection settings change without mutating prior state', () => {
        const statuses: AIProviderConnectionStatusMap = setAIProviderConnectionStatus(
            {},
            'gemini',
            { kind: 'success', operation: 'test-connection' },
        );
        const invalidated = invalidateAIProviderConnectionStatus(statuses, 'gemini');

        expect(getAIProviderConnectionStatus(statuses, 'gemini').kind).toBe('success');
        expect(getAIProviderConnectionStatus(invalidated, 'gemini').kind).toBe('untested');
        expect(invalidateAIProviderConnectionStatus(invalidated, 'missing')).toBe(invalidated);
    });

    it('normalizes empty, malformed, control-heavy, and oversized failure details', () => {
        expect(normalizeAIProviderConnectionStatusMessage(undefined)).toBe('');
        expect(normalizeAIProviderConnectionStatusMessage({ message: 'secret' })).toBe('');
        expect(normalizeAIProviderConnectionStatusMessage('  failed\n\trequest\u0000\u007f  ')).toBe('failed request');
        expect(normalizeAIProviderConnectionStatusMessage('x'.repeat(500))).toHaveLength(160);
    });
});
