import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../../utils/fileImportGuards';

const importStore = async () => {
    vi.resetModules();
    return import('../mindmapHistoryStore');
};

describe('mindmapHistoryStore', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('serializes history snapshots through the mindmap sanitizer', async () => {
        const { serializeHistoryNodeData } = await importStore();
        const serialized = serializeHistoryNodeData({
            id: 'root',
            topic: 'Root',
            constructor: { polluted: true },
            children: [
                { id: '<bad>', topic: 'Child', hyperLink: 'javascript:alert(1)' },
            ],
        } as unknown as NodeObj);
        const parsed = JSON.parse(serialized);

        expect(parsed.id).toBe('root');
        expect(parsed.children[0].id).toMatch(/^ai_/);
        expect(parsed.children[0].hyperLink).toBeUndefined();
        expect(Object.hasOwn(parsed, 'constructor')).toBe(false);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('parses history snapshots with size bounds and sanitization', async () => {
        const { parseHistoryNodeData } = await importStore();
        const node = parseHistoryNodeData(JSON.stringify({
            id: 'root',
            topic: 'Root',
            note: 'n'.repeat(5000),
            children: [{ id: 'safe-1', topic: 'Child', hyperLink: 'example.com/doc' }],
        }));

        expect(node.note).toHaveLength(4000);
        expect(node.children?.[0]?.hyperLink).toBe('https://example.com/doc');
        expect(() => parseHistoryNodeData('x'.repeat(MINDMAP_TEXT_IMPORT_MAX_BYTES + 1))).toThrow('too large');
    });

    it('stores sanitized records and keeps duplicate suppression', async () => {
        const { addHistoryRecord, getHistoryList, setCurrentDiagramId } = await importStore();
        setCurrentDiagramId('diagram-a');
        const node = {
            id: 'root',
            topic: 'Root',
            children: [{ id: 'child-1', topic: 'Child' }],
        } as unknown as NodeObj;

        addHistoryRecord('first', node);
        addHistoryRecord('duplicate', node);

        const list = getHistoryList();
        expect(list).toHaveLength(1);
        expect(JSON.parse(list[0].data).children[0].id).toBe('child-1');
    });

    it('keeps explicit close and keyboard toggle state synchronized', async () => {
        const {
            emitToggleHistory,
            getHistoryOpen,
            setHistoryOpen,
            subscribeToggleHistory,
        } = await importStore();
        const states: boolean[] = [];
        const unsubscribe = subscribeToggleHistory(open => states.push(open));

        expect(states).toEqual([false]);
        setHistoryOpen(true);
        setHistoryOpen(false);
        emitToggleHistory();

        expect(states).toEqual([false, true, false, true]);
        expect(getHistoryOpen()).toBe(true);
        unsubscribe();
    });
});
