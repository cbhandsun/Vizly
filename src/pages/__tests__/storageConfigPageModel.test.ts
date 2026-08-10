import { describe, expect, it } from 'vitest';
import {
    getFirstInvalidFieldName,
    isAbortFailure,
    isFormValidationFailure,
    S3_CONNECTION_TIMEOUT_MS,
} from '../storageConfigPageModel';

describe('storageConfigPageModel', () => {
    it('recognizes Ant Design validation failures without accepting malformed values', () => {
        expect(isFormValidationFailure({ errorFields: [] })).toBe(true);
        expect(isFormValidationFailure({ errorFields: [{ name: ['endpoint'] }] })).toBe(true);
        expect(isFormValidationFailure({ errorFields: [{ name: ['items', 0, 'name'] }] })).toBe(true);
        expect(isFormValidationFailure({ errorFields: [{}] })).toBe(false);
        expect(isFormValidationFailure({ errorFields: [{ name: [] }] })).toBe(false);
        expect(isFormValidationFailure({ errorFields: [{ name: [Number.NaN] }] })).toBe(false);
        expect(isFormValidationFailure({ errorFields: [{ name: [{}] }] })).toBe(false);
        expect(isFormValidationFailure({ errorFields: 'invalid' })).toBe(false);
        expect(isFormValidationFailure([])).toBe(false);
        expect(isFormValidationFailure(null)).toBe(false);
    });

    it('returns a defensive copy of the first valid field name path', () => {
        const name = ['items', 0, 'name'];
        const failure = { errorFields: [{ name }, { name: ['bucket'] }] };

        expect(getFirstInvalidFieldName(failure)).toEqual(name);
        expect(getFirstInvalidFieldName(failure)).not.toBe(name);
        expect(getFirstInvalidFieldName({ errorFields: [] })).toBeNull();
        expect(getFirstInvalidFieldName({ errorFields: [{ name: ['endpoint', Infinity] }] })).toBeNull();
        expect(getFirstInvalidFieldName(null)).toBeNull();
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
