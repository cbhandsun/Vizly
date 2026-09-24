import { describe, expect, it } from 'vitest';
import {
    getFirstInvalidFieldName,
    isAbortFailure,
    isFormValidationFailure,
    S3_CONNECTION_TIMEOUT_MS,
    validateStorageAccessKeyId,
    validateStorageBucket,
    validateStorageEndpoint,
    validateStorageRegion,
    validateStorageSecretAccessKey,
} from '../storageConfigPageModel';

describe('storageConfigPageModel', () => {
    it('classifies empty and unsafe storage endpoints before network operations', () => {
        expect(validateStorageEndpoint(undefined)).toBe('required');
        expect(validateStorageEndpoint(null)).toBe('required');
        expect(validateStorageEndpoint('')).toBe('required');
        expect(validateStorageEndpoint('   ')).toBe('required');
        expect(validateStorageEndpoint('ftp://storage.example.com')).toBe('invalid');
        expect(validateStorageEndpoint('storage.example.com')).toBe('invalid');
        expect(validateStorageEndpoint('http://storage.example.com')).toBe('invalid');
        expect(validateStorageEndpoint('https://user:secret@storage.example.com')).toBe('invalid');
        expect(validateStorageEndpoint('https://storage.example.com')).toBeNull();
        expect(validateStorageEndpoint('http://localhost:9000')).toBeNull();
        expect(validateStorageEndpoint('http://127.0.0.1:9000')).toBeNull();
        expect(validateStorageEndpoint('http://[::1]:9000')).toBeNull();
    });

    it('classifies empty and unsafe bucket and region values before persistence', () => {
        for (const value of [undefined, null, '', '   ']) {
            expect(validateStorageBucket(value)).toBe('required');
            expect(validateStorageRegion(value)).toBe('required');
        }

        for (const value of ['../vizly', 'folder/vizly', 'folder\\vizly', '.', '..', `vizly${String.fromCharCode(0)}`]) {
            expect(validateStorageBucket(value)).toBe('invalid');
        }
        expect(validateStorageBucket('vizly-diagrams')).toBeNull();
        expect(validateStorageBucket('vizly.diagrams_2026')).toBeNull();

        for (const value of ['us east 1', 'us/east/1', 'region!', `us-east-1${String.fromCharCode(0)}`]) {
            expect(validateStorageRegion(value)).toBe('invalid');
        }
        expect(validateStorageRegion('us-east-1')).toBeNull();
        expect(validateStorageRegion('minio_local.1')).toBeNull();
    });

    it('classifies credential fields while preserving valid session-secret fallback', () => {
        for (const value of [undefined, null, '', '   ']) {
            expect(validateStorageAccessKeyId(value)).toBe('required');
            expect(validateStorageSecretAccessKey(value, false)).toBe('required');
        }
        for (const value of ['ACCESS KEY', 'ACCESS\tKEY', `ACCESS${String.fromCharCode(0)}KEY`]) {
            expect(validateStorageAccessKeyId(value)).toBe('invalid');
        }
        expect(validateStorageAccessKeyId('AKIA_TEST-123')).toBeNull();
        expect(validateStorageSecretAccessKey(' secret with spaces ', false)).toBeNull();
        expect(validateStorageSecretAccessKey(`secret${String.fromCharCode(0)}`, false)).toBe('invalid');
        expect(validateStorageSecretAccessKey('', true)).toBeNull();
        expect(validateStorageSecretAccessKey('   ', true)).toBeNull();
    });

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
