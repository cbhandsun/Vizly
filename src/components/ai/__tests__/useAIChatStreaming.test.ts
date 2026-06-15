import { describe, expect, it, vi } from 'vitest';
import { AI_STREAM_JSON_MAX_CHARS, extractJson } from '../useAIChatStreaming';

describe('extractJson', () => {
    it('extracts fenced diagram JSON with valid array fields', () => {
        const json = '{"nodes":[],"edges":[]}';

        expect(extractJson(`prefix\n\`\`\`json\n${json}\n\`\`\`\nsuffix`)).toBe(json);
    });

    it('rejects JSON that only pretends to contain diagram fields', () => {
        expect(extractJson('{"nodes":"not-array","edges":"not-array"}')).toBeNull();
        expect(extractJson('{"message":"hello"}')).toBeNull();
    });

    it('patches bounded partial streaming JSON', () => {
        const partial = '{"nodes":[{"id":"n1","description":"Node","domain":"ops"}],"edges":[';
        const extracted = extractJson(partial, true);

        expect(extracted).toBe('{"nodes":[{"id":"n1","description":"Node","domain":"ops"}],"edges":[]}');
    });

    it('rejects oversized model output before parsing or patching', () => {
        const parseSpy = vi.spyOn(JSON, 'parse');

        expect(extractJson('x'.repeat(AI_STREAM_JSON_MAX_CHARS + 1))).toBeNull();
        expect(parseSpy).not.toHaveBeenCalled();

        parseSpy.mockRestore();
    });
});
