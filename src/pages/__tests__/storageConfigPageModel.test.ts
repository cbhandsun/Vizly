import { describe, expect, it } from 'vitest';
import { isAbortFailure, isFormValidationFailure, S3_CONNECTION_TIMEOUT_MS } from '../storageConfigPageModel';

describe('storageConfigPageModel', () => {
    it('recognizes Ant Design validation failures without accepting malformed values', () => {
        expect(isFormValidationFailure({ errorFields: [] })).toBe(true);
        expect(isFormValidationFailure({ errorFields: [{ name: ['endpoint'] }] })).toBe(true);
        expect(isFormValidationFailure({ errorFields: 'invalid' })).toBe(false);
        expect(isFormValidationFailure([])).toBe(false);
        expect(isFormValidationFailure(null)).toBe(false);
    });

    it('recognizes abort-shaped failures without treating other errors as timeouts', () => {
        expect(isAbortFailure({ name: 'AbortError' })).toBe(true);
        expect(isAbortFailure(new Error('network failed'))).toBe(false);
        expect(isAbortFailure('AbortError')).toBe(false);
        expect(isAbortFailure(null)).toBe(false);
    });

    it('uses a bounded connection timeout', () => {
        expect(S3_CONNECTION_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
        expect(S3_CONNECTION_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    });
});
