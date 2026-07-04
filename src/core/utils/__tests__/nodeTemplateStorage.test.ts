import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    coerceNodeTemplate,
    coerceNodeTemplates,
    NODE_TEMPLATES_STORAGE_KEY,
    readNodeTemplates,
    writeNodeTemplates,
} from '../nodeTemplateStorage';

const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
    safeLog: safeLogState,
}));

describe('nodeTemplateStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        Object.values(safeLogState).forEach((mock) => mock.mockReset());
    });

    it('coerces valid single-node templates and strips unsafe data keys', () => {
        const template = coerceNodeTemplate({
            id: ' tpl-1 ',
            name: ' API ',
            category: ' Services ',
            nodeType: 'flowchart',
            data: {
                label: 'Gateway',
                constructor: { polluted: true },
                nested: { __proto__: { polluted: true }, ok: true },
            },
            style: { width: 120, height: 60 },
            createdAt: 100,
        });

        expect(template).toEqual({
            id: 'tpl-1',
            name: 'API',
            category: 'Services',
            nodeType: 'flowchart',
            data: { label: 'Gateway', nested: { ok: true } },
            style: { width: 120, height: 60 },
            createdAt: 100,
        });
    });

    it('rejects templates with unsafe ids and invalid group node coordinates', () => {
        expect(coerceNodeTemplate({ id: '<script>', nodeType: 'flowchart' })).toBeNull();

        const template = coerceNodeTemplate({
            id: 'tpl-1',
            name: 'Bad group',
            category: 'Group',
            nodeType: 'flowchart',
            data: {},
            createdAt: 1,
            isGroup: true,
            nodes: [
                { type: 'flowchart', data: {}, relativeX: 0, relativeY: 0 },
                { type: 'flowchart', data: {}, relativeX: Number.POSITIVE_INFINITY, relativeY: 0 },
            ],
            edges: [
                { sourceIndex: 0, targetIndex: 0 },
                { sourceIndex: 0, targetIndex: 3 },
            ],
        });

        expect(template?.nodes).toHaveLength(1);
        expect(template?.edges).toEqual([{ sourceIndex: 0, targetIndex: 0 }]);
    });

    it('deduplicates and limits template arrays', () => {
        const templates = coerceNodeTemplates([
            { id: 'tpl-1', name: 'One', category: 'A', nodeType: 'flowchart', data: {}, createdAt: 1 },
            { id: 'tpl-1', name: 'Duplicate', category: 'A', nodeType: 'flowchart', data: {}, createdAt: 2 },
            { id: '<bad>', name: 'Bad', category: 'A', nodeType: 'flowchart', data: {}, createdAt: 3 },
            ...Array.from({ length: 120 }, (_, index) => ({
                id: `tpl-${index + 2}`,
                name: `T${index}`,
                category: 'A',
                nodeType: 'flowchart',
                data: {},
                createdAt: index,
            })),
        ]);

        expect(templates).toHaveLength(100);
        expect(templates[0].id).toBe('tpl-1');
        expect(templates.some(template => template.id === '<bad>')).toBe(false);
        expect(templates.at(-1)?.id).toBe('tpl-100');
    });

    it('reads malformed storage as empty and writes normalized templates', () => {
        localStorage.setItem(NODE_TEMPLATES_STORAGE_KEY, '{broken');
        expect(readNodeTemplates()).toEqual([]);
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[nodeTemplateStorage] Failed to read "diagram-node-templates":',
            expect.anything()
        );

        const written = writeNodeTemplates([
            { id: 'tpl-1', name: 'One', category: 'A', nodeType: 'flowchart', data: {}, createdAt: 1 },
            { id: 'bad id', name: 'Bad', category: 'A', nodeType: 'flowchart', data: {}, createdAt: 1 },
        ]);

        expect(written).toHaveLength(1);
        expect(JSON.parse(localStorage.getItem(NODE_TEMPLATES_STORAGE_KEY) || '[]')).toEqual(written);
        expect(readNodeTemplates()).toEqual(written);
    });

    it('ignores oversized template payloads', () => {
        localStorage.setItem(NODE_TEMPLATES_STORAGE_KEY, 'x'.repeat(2 * 1024 * 1024 + 1));
        expect(readNodeTemplates()).toEqual([]);
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[nodeTemplateStorage] Failed to read "diagram-node-templates":',
            expect.anything()
        );
    });
});
