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

    it('extracts alternative reasoning and thinking deltas for modern models', () => {
        expect(parseAIStreamDelta(makeChunk({
            content: 'ans',
            reasoning: 'step 1',
        }))).toEqual({
            content: 'ans',
            reasoningContent: 'step 1',
        });

        expect(parseAIStreamDelta(makeChunk({
            content: 'ans',
            thinking: 'thought 1',
        }))).toEqual({
            content: 'ans',
            reasoningContent: 'thought 1',
        });
    });

    it('ignores done markers, malformed JSON, and wrong-shaped chunks', () => {
        expect(parseAIStreamDelta('[DONE]')).toBeNull();
        expect(parseAIStreamDelta('{broken')).toBeNull();
        expect(parseAIStreamDelta(JSON.stringify({ choices: [] }))).toBeNull();
        expect(parseAIStreamDelta(makeChunk({ content: 123, reasoning_content: null }))).toBeNull();
    });

    it('parses and sanitizes gateway tool calls', () => {
        expect(parseAIStreamDelta(JSON.stringify({
            vizly: {
                type: 'tool-call',
                toolName: 'connectNodes',
                input: { source: 'node-1', target: 'node-2', label: 'next' },
            },
        }))).toEqual({
            toolCalls: [{
                action: 'connectNodes',
                source: 'node-1',
                target: 'node-2',
                label: 'next',
            }],
        });

        expect(parseAIStreamDelta(JSON.stringify({
            vizly: { type: 'tool-call', toolName: 'deleteNodes', input: { ids: ['node-1'] } },
        }))).toBeNull();
    });

    it('surfaces a bounded generic gateway stream error', () => {
        expect(() => parseAIStreamDelta(JSON.stringify({
            vizly: { type: 'error', message: 'provider secret should not be shown' },
        }))).toThrow('AI Gateway 流式响应失败。');
    });

    it('rejects oversized SSE data before JSON.parse', () => {
        const parseSpy = vi.spyOn(JSON, 'parse');

        expect(parseAIStreamDelta('x'.repeat(AI_STREAM_SSE_DATA_MAX_CHARS + 1))).toBeNull();
        expect(parseSpy).not.toHaveBeenCalled();

        parseSpy.mockRestore();
    });

    it('preserves large complete deltas instead of truncating generated diagrams', () => {
        const content = 'x'.repeat(30_000);
        const parsed = parseAIStreamDelta(makeChunk({ content }));
        expect(parsed?.content).toBe(content);
        expect(AI_STREAM_DELTA_TEXT_MAX_CHARS).toBeGreaterThan(content.length);
    });
    it('shows only allowlisted gateway failure diagnostics', () => {
        expect(() => parseAIStreamDelta(JSON.stringify({ vizly: { type: 'error', code: 'upstream-route', status: 404,
            message: 'private token' } }))).toThrow('请检查服务地址及公网转发配置');
        expect(() => parseAIStreamDelta(JSON.stringify({ vizly: { type: 'error', code: 'upstream-auth', status: 403,
            message: 'private token', responseBody: 'private response' } }))).toThrow('(403)');
        expect(() => parseAIStreamDelta(JSON.stringify({ vizly: { type: 'error', code: 'private token', status: 'secret' } })))
            .toThrow('AI Gateway 流式响应失败。');
    });

});
