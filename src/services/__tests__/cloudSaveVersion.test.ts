import { describe, expect, it } from 'vitest';
import { assertCloudSaveViewCurrent, captureCloudSaveVersion, readSavedCloudRevision } from '../cloudSaveVersion';

const revision = '2026-10-08T14:00:00.123456+00:00';
describe('cloud save version boundary', () => {
    it('captures the loaded exact revision independently of later mutations', () => {
        const cloud = { provider: 'supabase', id: 'one', revision };
        const captured = captureCloudSaveVersion('supabase', 'one', cloud);
        cloud.revision = '2026-10-08T14:00:00.123457+00:00';
        expect(captured).toBe(revision);
    });
    it.each([undefined, null, '', 42, 'invalid', '2026-02-30T00:00:00Z'])('rejects a legacy or invalid loaded revision: %j', revision => {
        expect(() => captureCloudSaveVersion('supabase', 'one', { provider: 'supabase', id: 'one', revision })).toThrow('缺少加载版本');
    });
    it.each([undefined, null, {}, { provider: 's3', id: 'one', revision }])('allows creating a new replica without a Supabase loaded identity: %j', cloud => {
        expect(captureCloudSaveVersion('supabase', 'one', cloud)).toBeUndefined();
    });
    it('captures S3 exact ETags and rejects missing saved revisions', () => {
        expect(captureCloudSaveVersion('s3', 'one', {})).toBeUndefined();
        expect(captureCloudSaveVersion('s3', 'one', { provider: 's3', id: 'one', revision: '"multipart-2"' })).toBe('"multipart-2"');
        expect(() => captureCloudSaveVersion('s3', 'one', { provider: 's3', id: 'one' })).toThrow('缺少加载版本');
        expect(() => readSavedCloudRevision('s3', null)).toThrow('未返回有效保存版本');
        expect(readSavedCloudRevision('s3', { expectedRevision: '"multipart-3"' })).toBe('"multipart-3"');
    });
    it('advances only from the exact returned revision', () => {
        expect(readSavedCloudRevision('supabase', { updated_at: revision })).toBe(revision);
    });
    it.each([undefined, null, {}, { updated_at: 'invalid' }, { updated_at: 0 }])('rejects an untrustworthy save response: %j', saved => {
        expect(() => readSavedCloudRevision('supabase', saved)).toThrow('未返回有效保存版本');
    });
    it('rejects a switched document, replaced identity or advanced revision', () => {
        const cloud = { provider: 'supabase', id: 'one', revision };
        const bridge = { id: 'one', metadata: { cloud } };
        expect(() => assertCloudSaveViewCurrent(bridge, 'one', cloud, revision)).not.toThrow();
        expect(() => assertCloudSaveViewCurrent(bridge, 'two', cloud, revision)).toThrow('已切换');
        expect(() => assertCloudSaveViewCurrent(bridge, 'one', { ...cloud }, revision)).toThrow('已切换');
        cloud.revision = '2026-10-08T14:00:00.123457+00:00';
        expect(() => assertCloudSaveViewCurrent(bridge, 'one', cloud, revision)).toThrow('已切换');
    });
});
