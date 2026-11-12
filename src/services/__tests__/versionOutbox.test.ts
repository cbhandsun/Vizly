// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createVersionOutboxTask, hashVersionPayload } from '../versionOutbox';
import type { DiagramVersion } from '../storage/types';

const version: DiagramVersion = {
    id: 'operation-a', diagramId: 'diagram-a', createdAt: 1, message: 'message',
    snapshotData: { nodes: [], edges: [] },
    storage: { ownerId: 'owner-a', provider: 'supabase', location: 'local', syncStatus: 'pending', localCreated: true },
};

describe('immutable outbox upload identity', () => {
    it('hashes content independently of key order, local timestamps and retry metadata', async () => {
        const hash = await hashVersionPayload(version);
        expect(await hashVersionPayload({ ...version, createdAt: 99, snapshotData: { edges: [], nodes: [] },
            storage: { ...version.storage!, failure: 'network' } })).toBe(hash);
        expect(await hashVersionPayload({ ...version, message: 'changed' })).not.toBe(hash);
        expect(await hashVersionPayload({ ...version, diagramId: 'another' })).not.toBe(hash);
        expect(await hashVersionPayload({ ...version, snapshotData: null })).not.toBe(hash);
    });
    it('reuses the same operation identity across reconstruction', async () => {
        expect(await createVersionOutboxTask(version)).toEqual(await createVersionOutboxTask(structuredClone(version)));
        expect(await createVersionOutboxTask(version)).toMatchObject({ operationId: version.id, versionId: version.id,
            ownerId: 'owner-a', provider: 'supabase', attempts: 0, status: 'pending' });
    });
    it.each([{ ownerId: null }, { provider: 's3' }, { localCreated: false }, { syncStatus: 'legacy' },
        { syncStatus: 'synced' }, { location: 'cloud' }])('does not adopt ineligible versions: %j', async patch => {
        await expect(createVersionOutboxTask({ ...version, storage: { ...version.storage!, ...patch } } as DiagramVersion)).rejects.toThrow('not eligible');
    });
});
