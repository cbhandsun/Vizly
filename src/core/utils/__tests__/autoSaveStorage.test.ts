import { describe, expect, it } from 'vitest';
import {
    AUTOSAVE_GC_TTL_MS,
    MAX_AUTOSAVE_JSON_CHARS,
    coerceAutoSavePayload,
    createAutoSavePayload,
    parseAutoSavePayload,
    refreshAutoSaveAccess,
    shouldCollectAutoSave,
} from '../autoSaveStorage';

describe('autoSaveStorage', () => {
    it('accepts valid autosave payloads and preserves safe metadata fields', () => {
        const payload = createAutoSavePayload({
            diagramId: ' diagram-a ',
            nodes: [{ id: 'n1', position: { x: 1, y: 2 }, data: { label: 'A' } } as any],
            edges: [{ id: 'e1', source: 'n1', target: 'n1' } as any],
            timestamp: 1000,
            isFreshSeed: true,
            layout: { direction: 'LR' },
            metadata: { type: 'flowchart' },
        });

        expect(payload).toEqual({
            diagramId: 'diagram-a',
            nodes: [expect.objectContaining({ id: 'n1', position: { x: 1, y: 2 } })],
            edges: [expect.objectContaining({ id: 'e1', source: 'n1', target: 'n1' })],
            timestamp: 1000,
            lastAccessedAt: 1000,
            version: '1.0',
            isFreshSeed: true,
            layout: { direction: 'LR' },
            metadata: { type: 'flowchart' },
        });
    });

    it('allows empty canvas autosaves', () => {
        expect(coerceAutoSavePayload({
            diagramId: 'empty',
            nodes: [],
            edges: [],
            timestamp: 1,
            version: '1.0',
        })).toEqual({
            diagramId: 'empty',
            nodes: [],
            edges: [],
            timestamp: 1,
            version: '1.0',
        });
    });

    it('rejects malformed payloads and unsafe node data', () => {
        expect(parseAutoSavePayload('{broken')).toBeNull();
        expect(coerceAutoSavePayload(null)).toBeNull();
        expect(coerceAutoSavePayload({
            nodes: [{ id: 'n1', position: { x: Number.POSITIVE_INFINITY, y: 0 } }],
            edges: [],
        })).toBeNull();
        expect(coerceAutoSavePayload({
            nodes: Array.from({ length: 1001 }, (_, index) => ({ id: `n-${index}`, position: { x: 0, y: 0 } })),
            edges: [],
        })).toBeNull();
        expect(parseAutoSavePayload('x'.repeat(MAX_AUTOSAVE_JSON_CHARS + 1))).toBeNull();
    });

    it('sanitizes autosave node data, layout, and metadata objects', () => {
        const payload = coerceAutoSavePayload(JSON.parse(`{
            "nodes": [{
                "id": "n1",
                "position": { "x": 0, "y": 0 },
                "data": {
                    "label": "A",
                    "constructor": { "polluted": true },
                    "nested": { "__proto__": { "polluted": true }, "ok": true }
                }
            }],
            "edges": [],
            "layout": {
                "direction": "LR",
                "prototype": { "polluted": true }
            },
            "metadata": {
                "type": "flowchart",
                "constructor": { "polluted": true },
                "nested": { "__proto__": { "polluted": true }, "ok": true }
            }
        }`));

        expect(payload?.nodes[0].data).toEqual({ label: 'A', nested: { ok: true } });
        expect(payload?.layout).toEqual({ direction: 'LR' });
        expect(payload?.metadata).toEqual({ type: 'flowchart', nested: { ok: true } });
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('filters invalid edges while preserving valid nodes', () => {
        const payload = coerceAutoSavePayload({
            nodes: [{ id: 'n1', position: { x: 0, y: 0 } }],
            edges: [
                { id: 'ok', source: 'n1', target: 'n1' },
                { id: 'bad', source: 'n1', target: 'missing' },
            ],
        });

        expect(payload?.edges).toEqual([expect.objectContaining({ id: 'ok' })]);
    });

    it('refreshes access times and marks stale or invalid entries for collection', () => {
        const payload = createAutoSavePayload({
            nodes: [{ id: 'n1', position: { x: 0, y: 0 } } as any],
            edges: [],
            timestamp: 100,
        });

        expect(refreshAutoSaveAccess(payload!, 200).lastAccessedAt).toBe(200);
        expect(shouldCollectAutoSave(null, 200)).toBe(true);
        expect(shouldCollectAutoSave(payload, 100 + AUTOSAVE_GC_TTL_MS + 1)).toBe(true);
        expect(shouldCollectAutoSave(refreshAutoSaveAccess(payload!, 200), 300)).toBe(false);
    });
});
