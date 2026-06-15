import { describe, expect, it, vi } from 'vitest';
import {
    AI_STREAM_DELTA_TEXT_MAX_CHARS,
    AI_STREAM_SSE_DATA_MAX_CHARS,
    parseAIStreamDelta,
} from '../aiStreamParsing';

const makeChunk = (delta: Record<string, unknown>): string => JSON.stringify({
    choices: [{ delta }],
});

describe('parseAIStreamDelta', () => {
    it('extracts bounded content and reasoning deltas', () => {
        expect(parseAIStreamDelta(makeChunk({
            content: 'visible',
            reasoning_content: 'thinking',
        }))).toEqual({
            content: 'visible',
            reasoningContent: 'thinking',
        });
    });

    it('ignores done markers, malformed JSON, and wrong-shaped chunks', () => {
        expect(parseAIStreamDelta('[DONE]')).toBeNull();
        expect(parseAIStreamDelta('{broken')).toBeNull();
        expect(parseAIStreamDelta(JSON.stringify({ choices: [] }))).toBeNull();
        expect(parseAIStreamDelta(makeChunk({ content: 123, reasoning_content: null }))).toBeNull();
    });

    it('rejects oversized SSE data before JSON.parse', () => {
        const parseSpy = vi.spyOn(JSON, 'parse');

        expect(parseAIStreamDelta('x'.repeat(AI_STREAM_SSE_DATA_MAX_CHARS + 1))).toBeNull();
        expect(parseSpy).not.toHaveBeenCalled();

        parseSpy.mockRestore();
    });

    it('truncates oversized delta strings', () => {
        const parsed = parseAIStreamDelta(makeChunk({
            content: 'x'.repeat(AI_STREAM_DELTA_TEXT_MAX_CHARS + 100),
        }));

        expect(parsed?.content).toHaveLength(AI_STREAM_DELTA_TEXT_MAX_CHARS);
    });
});
