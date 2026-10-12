// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { commitCollaborationCloudRevision } from '../collaborationCloudRevision';
import { assertCloudSaveViewCurrent, captureCloudSaveVersion } from '@/services/cloudSaveVersion';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const oldRevision = '2026-10-08T20:00:00.123456Z';
const newRevision = '2026-10-08T20:00:00.123457Z';
const bridge = () => ({ id, metadata: { title: 'Title', cloud: { provider: 'supabase', id, title: 'Cloud', revision: oldRevision } } });
describe('cloud save metadata after accepted collaboration commit', () => {
  it('updates exact revision, preserves metadata and invalidates a save preparing the old canvas', () => {
    const target = bridge(); const captured = target.metadata.cloud;
    expect(commitCollaborationCloudRevision(target, id, newRevision)).toBe(true);
    expect(captureCloudSaveVersion('supabase', id, target.metadata.cloud)).toBe(newRevision);
    expect(target.metadata).toEqual({ title: 'Title', cloud: { ...captured, revision: newRevision } });
    expect(() => assertCloudSaveViewCurrent(target, id, captured, oldRevision)).toThrow();
  });
  it.each([undefined, null, '', 'bad', oldRevision, '2026-10-08T20:00:00.123455Z'])('never advances metadata using %s', value => {
    const target = bridge(), before = target.metadata;
    expect(commitCollaborationCloudRevision(target, id, value)).toBe(false);
    expect(target.metadata).toBe(before);
  });
  it('rejects missing metadata, other diagrams, and other providers', () => {
    for (const target of [{ id }, { ...bridge(), id: 'other' }, { id, metadata: { cloud: {} } },
      { id, metadata: { cloud: { provider: 's3', id, revision: oldRevision } } },
      { id, metadata: { cloud: { provider: 'supabase', id: 'other', revision: oldRevision } } }]) {
      expect(commitCollaborationCloudRevision(target, id, newRevision)).toBe(false);
    }
  });
});
