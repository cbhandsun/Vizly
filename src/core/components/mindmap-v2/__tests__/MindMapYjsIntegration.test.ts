import { describe, expect, it } from 'vitest';
import { MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../../utils/fileImportGuards';
import {
    parseRemoteMindMapYjsData,
    serializeLocalMindMapYjsData,
} from '../mindmapYjsSecurity';

describe('MindMapYjsIntegration data guards', () => {
    it('parses and sanitizes remote mindmap payloads before refresh', () => {
        const parsed = parseRemoteMindMapYjsData(JSON.stringify({
            direction: 99,
            nodeData: {
                id: 'root',
                topic: 'Root',
                hyperLink: 'javascript:alert(1)',
                constructor: { polluted: true },
                children: [
                    { id: 'child-1', topic: 'Child', hyperLink: 'example.com/doc' },
                ],
            },
        }));

        expect(parsed.direction).toBe(3);
        expect(parsed.nodeData.hyperLink).toBeUndefined();
        expect(parsed.nodeData.children?.[0]?.hyperLink).toBe('https://example.com/doc');
        expect(Object.hasOwn(parsed.nodeData, 'constructor')).toBe(false);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('rejects oversized remote payloads before JSON parsing', () => {
        expect(() => parseRemoteMindMapYjsData('x'.repeat(MINDMAP_TEXT_IMPORT_MAX_BYTES + 1))).toThrow('too large');
    });

    it('serializes local data through the same sanitizer before broadcasting', () => {
        const serialized = serializeLocalMindMapYjsData({
            nodeData: {
                id: 'root',
                topic: 'Root',
                children: [
                    { id: '<bad>', topic: 'Child', note: 'n'.repeat(5000) },
                ],
            },
        });
        const parsed = JSON.parse(serialized);

        expect(parsed.nodeData.id).toBe('root');
        expect(parsed.nodeData.children[0].id).toMatch(/^ai_/);
        expect(parsed.nodeData.children[0].note).toHaveLength(4000);
    });
});
