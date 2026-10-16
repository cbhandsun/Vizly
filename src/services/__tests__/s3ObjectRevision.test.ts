// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseS3ObjectRevision, s3WriteConditionHeaders, type S3WriteCondition } from '../s3ObjectRevision';

describe('S3 strong object revision boundary', () => {
    it.each(['"abc"', '"0123456789abcdef-16"', '"' + 'x'.repeat(512) + '"'])('preserves exact opaque revisions: %s', revision => {
        expect(parseS3ObjectRevision(revision)).toBe(revision);
        expect(s3WriteConditionHeaders({ ifMatch: revision })).toEqual({ 'if-match': revision });
    });
    it.each([undefined, null, 0, {}, '', '""', '*', 'W/"abc"', 'abc', ' "abc"', '"a b"', '"a,b"', '"*"', '"a\\b"', '"a\r\nb"', '"中文"', '"' + 'x'.repeat(513) + '"'])('rejects malformed, weak, multiple or oversized revisions: %j', revision => {
        expect(parseS3ObjectRevision(revision)).toBeUndefined();
        expect(() => s3WriteConditionHeaders({ ifMatch: revision } as S3WriteCondition)).toThrow();
    });
    it('accepts create-only policy and rejects missing or conflicting policies', () => {
        expect(s3WriteConditionHeaders({ ifNoneMatch: '*' })).toEqual({ 'if-none-match': '*' });
        for (const condition of [null, [], {}, { ifNoneMatch: 'x' }, { ifMatch: '"x"', ifNoneMatch: '*' }]) {
            expect(() => s3WriteConditionHeaders(condition as S3WriteCondition)).toThrow();
        }
    });
});
