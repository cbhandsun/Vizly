import { describe, expect, it } from 'vitest';
import {
    coerceDiagramVersion,
    coerceVersionMessage,
    coerceVersionSnapshotData,
    isSafeVersionId,
    parseDiagramVersionList,
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
        expect(coerceVersionMessage(' release\u0000  \u202ecandidate ')).toBe('release candidate');
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

    it('normalizes complete diagram version records and rejects unsafe metadata', () => {
        const version = coerceDiagramVersion({
            id: ' version-1 ',
            diagramId: ' diagram-1 ',
            snapshotData: makeSnapshot(),
            createdAt: 123,
            message: '  restored ',
            authorId: ` user\u2066  ${'x'.repeat(240)} `,
        });

        expect(version).toMatchObject({
            id: 'version-1',
            diagramId: 'diagram-1',
            message: 'restored',
            authorId: `user ${'x'.repeat(175)}`,
            createdAt: 123,
        });
        expect(coerceDiagramVersion({
            id: '../bad',
            diagramId: 'diagram-1',
            snapshotData: makeSnapshot(),
            createdAt: 1,
        })).toBeNull();
        expect(coerceDiagramVersion({
            id: 'version-1',
            diagramId: 'diagram-1',
            snapshotData: null,
            createdAt: Number.NaN,
        })).toBeNull();
        expect(coerceDiagramVersion('not a record')).toBeNull();
    });

    it('parses a bounded, scoped, unique version list in descending time order', () => {
        const parsed = parseDiagramVersionList([
            {
                id: 'version-1',
                diagramId: 'diagram-1',
                snapshotData: null,
                createdAt: 1,
                message: 'First',
            },
            {
                id: 'version-2',
                diagramId: 'diagram-1',
                snapshotData: null,
                createdAt: 2,
                message: 'Second',
            },
        ], 'diagram-1');

        expect(parsed).toEqual({
            ok: true,
            value: [
                expect.objectContaining({ id: 'version-2' }),
                expect.objectContaining({ id: 'version-1' }),
            ],
        });
    });

    it('rejects malformed, cross-diagram, duplicate, and oversized version lists', () => {
        const version = {
            id: 'version-1',
            diagramId: 'diagram-1',
            snapshotData: null,
            createdAt: 1,
        };

        expect(parseDiagramVersionList('invalid', 'diagram-1').ok).toBe(false);
        expect(parseDiagramVersionList([{ ...version, diagramId: 'diagram-2' }], 'diagram-1').ok).toBe(false);
        expect(parseDiagramVersionList([version, version], 'diagram-1').ok).toBe(false);
        expect(parseDiagramVersionList(
            Array.from({ length: 501 }, (_, index) => ({ ...version, id: `version-${index}` })),
            'diagram-1',
        ).ok).toBe(false);
    });
});
