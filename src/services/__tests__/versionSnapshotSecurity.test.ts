import { describe, expect, it } from 'vitest';
import {
    coerceDiagramVersion,
    coerceVersionMessage,
    coerceVersionSnapshotData,
    isSafeVersionId,
} from '../versionSnapshotSecurity';

const makeSnapshot = () => ({
    nodes: [{
        id: 'n1',
        position: { x: 0, y: 0 },
        data: {
            label: 'Node',
            constructor: { polluted: true },
            nested: { __proto__: { polluted: true }, ok: true },
        },
    }],
    edges: [],
});

describe('versionSnapshotSecurity', () => {
    it('validates version ids and normalizes messages', () => {
        expect(isSafeVersionId('diagram_1:local-2')).toBe(true);
        expect(isSafeVersionId('../diagram')).toBe(false);
        expect(isSafeVersionId('x'.repeat(181))).toBe(false);

        expect(coerceVersionMessage('  saved  ')).toBe('saved');
        expect(coerceVersionMessage('')).toBe('版本快照');
        expect(coerceVersionMessage('x'.repeat(600))).toHaveLength(500);
    });

    it('coerces snapshot data through clipboard guards', () => {
        const snapshot = coerceVersionSnapshotData(JSON.parse(JSON.stringify(makeSnapshot())));

        expect(snapshot.nodes[0].data).toEqual({ label: 'Node', nested: { ok: true } });
        expect(snapshot.edges).toEqual([]);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('rejects invalid or oversized snapshots', () => {
        expect(() => coerceVersionSnapshotData({ nodes: 'bad', edges: [] })).toThrow('valid nodes and edges');
        expect(() => coerceVersionSnapshotData({
            nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: 'x'.repeat(2 * 1024 * 1024) }],
            edges: [],
        })).toThrow('too large');
    });

    it('normalizes complete diagram version records and rejects unsafe ids', () => {
        const version = coerceDiagramVersion({
            id: ' version-1 ',
            diagramId: ' diagram-1 ',
            snapshotData: makeSnapshot(),
            createdAt: Number.NaN,
            message: '  restored ',
        });

        expect(version).toMatchObject({
            id: 'version-1',
            diagramId: 'diagram-1',
            message: 'restored',
        });
        expect(typeof version?.createdAt).toBe('number');
        expect(coerceDiagramVersion({
            id: '../bad',
            diagramId: 'diagram-1',
            snapshotData: makeSnapshot(),
            createdAt: 1,
        })).toBeNull();
    });
});
