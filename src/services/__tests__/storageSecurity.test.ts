import { describe, expect, it } from 'vitest';
import {
    coerceS3StorageConfig,
    coercePersistedS3StorageConfigDraft,
    hasPersistedS3SecretField,
    normalizeS3AccessKeyId,
    normalizeS3Endpoint,
    normalizeS3Bucket,
    normalizeS3Region,
    normalizeS3SecretAccessKey,
    redactSensitiveValue,
} from '../storageSecurity';

describe('storageSecurity', () => {
    it('normalizes bucket and region values through exported service boundaries', () => {
        expect(normalizeS3Bucket(' vizly-diagrams ')).toBe('vizly-diagrams');
        expect(normalizeS3Bucket('../vizly')).toBeNull();
        expect(normalizeS3Bucket('folder/vizly')).toBeNull();
        expect(normalizeS3Region(' us-east-1 ')).toBe('us-east-1');
        expect(normalizeS3Region('us east 1')).toBeNull();
    });

    it('normalizes credentials without accepting whitespace in access-key identifiers', () => {
        expect(normalizeS3AccessKeyId(' AKIA_TEST-123 ')).toBe('AKIA_TEST-123');
        expect(normalizeS3AccessKeyId('AUDIT ACCESS KEY')).toBeNull();
        expect(normalizeS3AccessKeyId('   ')).toBeNull();
        expect(normalizeS3SecretAccessKey(' secret with spaces ')).toBe('secret with spaces');
        expect(normalizeS3SecretAccessKey('   ')).toBeNull();
        expect(normalizeS3SecretAccessKey(`secret${String.fromCharCode(0)}`)).toBeNull();
    });

    it('allows HTTPS and local HTTP S3 endpoints only', () => {
        expect(normalizeS3Endpoint('https://s3.amazonaws.com/')).toBe('https://s3.amazonaws.com');
        expect(normalizeS3Endpoint('https://s3.amazonaws.com/?X-Amz-Signature=secret#frag')).toBe('https://s3.amazonaws.com');
        expect(normalizeS3Endpoint('http://localhost:9000')).toBe('http://localhost:9000');
        expect(normalizeS3Endpoint('http://127.0.0.1:9000')).toBe('http://127.0.0.1:9000');
        expect(normalizeS3Endpoint('http://[::1]:9000')).toBe('http://[::1]:9000');
        expect(normalizeS3Endpoint('http://169.254.169.254/latest/meta-data')).toBeNull();
        expect(normalizeS3Endpoint('//evil.example')).toBeNull();
        expect(normalizeS3Endpoint('https://user:pass@s3.amazonaws.com')).toBeNull();
    });

    it('redacts secrets in nested error details', () => {
        const redacted = redactSensitiveValue({
            message: 'Authorization AWS4-HMAC-SHA256 Credential=AKIA_TEST/20260612 Signature=abcdef1234',
            config: {
                accessKeyId: 'AKIA_TEST',
                secretAccessKey: 'super-secret',
                nested: ['token=abc123'],
            },
        });

        expect(JSON.stringify(redacted)).not.toContain('AKIA_TEST');
        expect(JSON.stringify(redacted)).not.toContain('super-secret');
        expect(JSON.stringify(redacted)).not.toContain('abcdef1234');
        expect(JSON.stringify(redacted)).toContain('[redacted]');
    });

    it('coerces valid persisted S3 config and merges the session secret', () => {
        expect(coerceS3StorageConfig({
            endpoint: 'https://s3.amazonaws.com/',
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: '',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
            s3ForcePathStyle: true,
        }, 'session-secret')).toEqual({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: 'session-secret',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
            s3ForcePathStyle: true,
        });
    });

    it('retains a valid non-secret draft when the session secret is unavailable', () => {
        expect(coercePersistedS3StorageConfigDraft({
            endpoint: 'https://s3.amazonaws.com/',
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: '',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
            s3ForcePathStyle: false,
        })).toEqual({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: '',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
            s3ForcePathStyle: false,
        });
    });

    it('detects a persisted secret field without trusting its value', () => {
        expect(hasPersistedS3SecretField({ secretAccessKey: 'legacy-secret' })).toBe(true);
        expect(hasPersistedS3SecretField({ secretAccessKey: 42 })).toBe(true);
        expect(hasPersistedS3SecretField({})).toBe(false);
        expect(hasPersistedS3SecretField(null)).toBe(false);
        expect(hasPersistedS3SecretField([])).toBe(false);
    });

    it('rejects wrong-shaped, incomplete, or unsafe S3 configs', () => {
        expect(coerceS3StorageConfig('bad', 'secret')).toBeNull();
        expect(coerceS3StorageConfig([], 'secret')).toBeNull();
        expect(coerceS3StorageConfig({
            endpoint: 'http://169.254.169.254/latest/meta-data',
            accessKeyId: 'AKIA_TEST',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
        }, 'secret')).toBeNull();
        expect(coerceS3StorageConfig({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
        })).toBeNull();
        expect(coerceS3StorageConfig({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            bucket: '../vizly',
            region: 'us-east-1',
        }, 'secret')).toBeNull();
        expect(coerceS3StorageConfig({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            bucket: 'vizly-diagrams',
            region: 'us east 1',
        }, 'secret')).toBeNull();
        expect(coerceS3StorageConfig({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
            secretAccessKey: `secret${String.fromCharCode(0)}`,
        })).toBeNull();
    });

    it('bounds S3 credential and config field lengths', () => {
        expect(coerceS3StorageConfig({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'A'.repeat(513),
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
        }, 'secret')).toBeNull();
        expect(coerceS3StorageConfig({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
        }, 's'.repeat(8_001))).toBeNull();
    });
});
