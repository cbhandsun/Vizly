import { describe, expect, it } from 'vitest';
import { MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../../utils/fileImportGuards';
import {
    MIND_ELIXIR_CLIPBOARD_MAGIC,
    parseMindElixirClipboardNodes,
} from '../mindmapClipboardSecurity';

describe('mindmapClipboardSecurity', () => {
    it('ignores non mind-elixir clipboard text', () => {
        expect(parseMindElixirClipboardNodes('plain text')).toBeNull();
        expect(parseMindElixirClipboardNodes(JSON.stringify({ data: [] }))).toBeNull();
    });

    it('sanitizes mind-elixir clipboard nodes before paste', () => {
        const nodes = parseMindElixirClipboardNodes(JSON.stringify({
            magic: MIND_ELIXIR_CLIPBOARD_MAGIC,
            data: [{
                id: '<bad>',
                topic: 'Copied',
                constructor: { polluted: true },
                hyperLink: 'javascript:alert(1)',
                branchColor: 'url(javascript:alert(1))',
                children: [{
                    id: 'safe-child',
                    topic: 'Child',
                    hyperLink: 'example.com/doc',
                }],
            }],
        }));

        expect(nodes).toHaveLength(1);
        expect(nodes?.[0].id).toMatch(/^ai_/);
        expect(nodes?.[0].topic).toBe('Copied');
        expect(nodes?.[0].hyperLink).toBeUndefined();
        expect((nodes?.[0] as any).branchColor).toBeUndefined();
        expect(Object.hasOwn(nodes?.[0] || {}, 'constructor')).toBe(false);
        expect(Object.prototype).not.toHaveProperty('polluted');
        expect(nodes?.[0].children?.[0].hyperLink).toBe('https://example.com/doc');
    });

    it('rejects oversized clipboard payloads', () => {
        expect(() => parseMindElixirClipboardNodes('x'.repeat(MINDMAP_TEXT_IMPORT_MAX_BYTES + 1)))
            .toThrow('too large');
    });
});
