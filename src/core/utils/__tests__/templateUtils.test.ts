import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
    coerceStoredTemplate,
    generateTemplateThumbnail,
    importTemplateFromJSON,
    parseStoredTemplates,
    serializeStoredTemplates,
    validateTemplate,
} from '../templateUtils';
import { TemplateCategory } from '../../types/Template';

const validTemplate = {
    id: 'tpl-1',
    name: 'Template 1',
    description: 'A template',
    category: TemplateCategory.CUSTOM,
    tags: ['one', 2],
    diagramData: {
        nodes: [],
        edges: [],
    },
    isBuiltIn: false,
    createdAt: '2026-06-13T00:00:00.000Z',
};

describe('templateUtils', () => {
    beforeEach(() => {
        Object.values(safeLogState).forEach(mock => mock.mockReset());
    });

    it('validates template shape and rejects invalid categories', () => {
        expect(validateTemplate(validTemplate)).toBe(true);
        expect(validateTemplate({ ...validTemplate, category: 'unknown' })).toBe(false);
        expect(validateTemplate({ ...validTemplate, diagramData: { nodes: {} } })).toBe(false);
    });

    it('coerces stored templates and restores dates', () => {
        const result = coerceStoredTemplate(validTemplate);

        expect(result?.createdAt).toBeInstanceOf(Date);
        expect(result?.createdAt.toISOString()).toBe('2026-06-13T00:00:00.000Z');
        expect(result?.tags).toEqual(['one']);
    });

    it('filters malformed stored template entries without throwing', () => {
        const result = parseStoredTemplates(JSON.stringify([
            validTemplate,
            { ...validTemplate, id: '', name: 'missing id' },
            { ...validTemplate, category: 'bad' },
            { ...validTemplate, createdAt: 'not-a-date' },
            null,
        ]));

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tpl-1');
    });

    it('returns an empty list for malformed or wrong-shaped storage', () => {
        expect(parseStoredTemplates('{broken')).toEqual([]);
        expect(parseStoredTemplates(JSON.stringify({ id: 'not-array' }))).toEqual([]);
        expect(parseStoredTemplates(null)).toEqual([]);
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[templateUtils.parseStoredTemplates] Failed to read "diagram-custom-templates":',
            expect.anything()
        );
    });

    it('bounds stored template parsing and serialization', () => {
        expect(parseStoredTemplates('x'.repeat(2 * 1024 * 1024 + 1))).toEqual([]);

        const manyTemplates = Array.from({ length: 55 }, (_, index) => ({
            ...validTemplate,
            id: `tpl-${index}`,
        }));

        expect(parseStoredTemplates(JSON.stringify(manyTemplates))).toHaveLength(50);

        const serialized = serializeStoredTemplates([
            { ...validTemplate, createdAt: new Date('2026-06-13T00:00:00.000Z') },
            { ...validTemplate, id: '', name: 'invalid' },
        ]);

        expect(JSON.parse(serialized)).toEqual([
            expect.objectContaining({
                id: 'tpl-1',
                createdAt: '2026-06-13T00:00:00.000Z',
            }),
        ]);
    });

    it('escapes thumbnail SVG text and rejects non-finite coordinate injection', async () => {
        const thumbnail = await generateTemplateThumbnail([
            {
                id: 'a',
                position: { x: 10, y: 20 },
                width: 100,
                height: 50,
                data: { label: 'A & "quoted"' },
            },
            {
                id: 'b',
                position: { x: '0" onload="alert(1)', y: Number.POSITIVE_INFINITY },
                width: '200" onclick="alert(1)',
                height: 60,
                data: { label: '</text><script>alert(1)</script>' },
            },
        ], [
            { source: 'a', target: 'b' },
        ]);

        expect(thumbnail).toMatch(/^data:image\/svg\+xml;base64,/);
        const encoded = thumbnail?.replace(/^data:image\/svg\+xml;base64,/, '') ?? '';
        const svg = decodeURIComponent(escape(atob(encoded)));

        expect(svg).toContain('A &amp; &quot;quoted&quot;');
        expect(svg).not.toContain('<script>');
        expect(svg).not.toContain('onload=');
        expect(svg).not.toContain('onclick=');
        expect(svg).not.toContain('Infinity');
    });

    it('imports templates through the same coercion and bounds as storage', () => {
        const imported = importTemplateFromJSON(JSON.stringify({
            ...validTemplate,
            name: 'x'.repeat(5000),
            tags: ['safe', 123, 'z'.repeat(200)],
        }));

        expect(imported?.createdAt).toBeInstanceOf(Date);
        expect(imported?.name).toHaveLength(4000);
        expect(imported?.tags).toEqual(['safe', 'z'.repeat(120)]);
    });

    it('rejects oversized imported template payloads and graph bodies', () => {
        expect(importTemplateFromJSON('x'.repeat(2 * 1024 * 1024 + 1))).toBeNull();
        expect(importTemplateFromJSON(JSON.stringify({
            ...validTemplate,
            diagramData: {
                nodes: Array.from({ length: 1001 }, (_, index) => ({ id: `n-${index}` })),
                edges: [],
            },
        }))).toBeNull();
    });

    it('redacts thumbnail generation failures before logging them', async () => {
        const encodeSpy = vi.spyOn(window, 'btoa').mockImplementation(() => {
            throw new Error('token=sk-live-secret');
        });

        await expect(generateTemplateThumbnail([
            {
                id: 'a',
                position: { x: 0, y: 0 },
                width: 100,
                height: 50,
                data: { label: 'Node A' },
            },
        ], [])).resolves.toBeNull();

        expect(safeLogState.error).toHaveBeenCalledWith(
            '[templateUtils] Failed to generate thumbnail:',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.error.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.error.mock.calls[0]?.[1])).not.toContain('sk-live-secret');
        encodeSpy.mockRestore();
    });

    it('redacts import failures before logging them', () => {
        const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
            throw new Error('Authorization: Bearer sk-live-secret');
        });

        expect(importTemplateFromJSON('{"bad":true}')).toBeNull();
        expect(safeLogState.error).toHaveBeenCalledWith(
            '[templateUtils] Failed to import template:',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.error.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.error.mock.calls[0]?.[1])).not.toContain('sk-live-secret');
        parseSpy.mockRestore();
    });
});
