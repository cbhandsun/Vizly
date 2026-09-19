import { describe, expect, it, vi } from 'vitest';
import {
    buildAIChatRequestMessages,
    consumeAIChatStream,
} from '../aiChatRequestFlow';

const encodeLines = (...lines: string[]): Uint8Array =>
    new TextEncoder().encode(lines.join('\n'));

describe('aiChatRequestFlow', () => {
    it('builds request messages with plugin context and history', () => {
        const messages = buildAIChatRequestMessages({
            systemPrompt: 'system prompt',
            pluginId: 'mindmap',
            historyMessages: [
                { role: 'assistant', content: 'prev answer' },
                { role: 'user', content: 'prev question' },
            ],
            userContent: 'latest question',
        });

        expect(messages).toEqual([
            {
                role: 'system',
                content: 'system prompt\n\n[当前图表模式: mindmap]',
            },
            { role: 'assistant', content: 'prev answer' },
            { role: 'user', content: 'prev question' },
            { role: 'user', content: 'latest question' },
        ]);
    });

    it('consumes SSE chunks and accumulates content plus reasoning', async () => {
        const reader = {
            read: vi
                .fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: encodeLines(
                        'data: {"choices":[{"delta":{"content":"Hello","reasoning_content":"Think"}}]}',
                        'data: {"choices":[{"delta":{"content":" world"}}]}'
                    ),
                })
                .mockResolvedValueOnce({
                    done: true,
                    value: undefined,
                }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;
        const onDelta = vi.fn();

        const state = await consumeAIChatStream({
            reader,
            signal: new AbortController().signal,
            parseDelta: (data) => {
                const delta = JSON.parse(data).choices[0].delta;
                return {
                    content: delta.content,
                    reasoningContent: delta.reasoning_content,
                };
            },
            onAbortReader: vi.fn(),
            onDelta,
        });

        expect(state).toEqual({
            content: 'Hello world',
            reasoningContent: 'Think',
            toolCalls: [],
        });
        expect(onDelta).toHaveBeenCalledTimes(2);
    });

    it('ignores done markers and incomplete final buffers until more data arrives', async () => {
        const reader = {
            read: vi
                .fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: encodeLines(
                        'data: {"choices":[{"delta":{"content":"A"}}]}',
                        'data: [DONE]',
                        'data: {"choices":[{"delta":{"content":"B"}}]}'
                    ),
                })
                .mockResolvedValueOnce({
                    done: true,
                    value: undefined,
                }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;

        const state = await consumeAIChatStream({
            reader,
            signal: new AbortController().signal,
            parseDelta: (data) => {
                const delta = JSON.parse(data).choices[0].delta;
                return { content: delta.content };
            },
            onAbortReader: vi.fn(),
        });

        expect(state.content).toBe('AB');
        expect(state.toolCalls).toEqual([]);
    });

    it('collects at most ten structured tool calls without adding them to visible content', async () => {
        const reader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: encodeLines(...Array.from({ length: 12 }, (_, index) => (
                        `data: {"tool":${index}}`
                    ))),
                })
                .mockResolvedValueOnce({ done: true, value: undefined }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;

        const state = await consumeAIChatStream({
            reader,
            signal: new AbortController().signal,
            parseDelta: (data) => ({
                toolCalls: [{ action: 'layout', strategy: `s${JSON.parse(data).tool}` }],
            }),
            onAbortReader: vi.fn(),
        });

        expect(state.content).toBe('');
        expect(state.toolCalls).toHaveLength(10);
        expect(state.toolCalls[9]).toEqual({ action: 'layout', strategy: 's9' });
    });

    it('throws abort reason and invokes reader cancellation callback', async () => {
        const controller = new AbortController();
        const abortReason = new DOMException('stop', 'AbortError');
        const onAbortReader = vi.fn(() => undefined);
        const reader = {
            read: vi.fn(async () => {
                controller.abort(abortReason);
                return { done: false, value: encodeLines('data: {"choices":[{"delta":{"content":"A"}}]}') };
            }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;

        await expect(consumeAIChatStream({
            reader,
            signal: controller.signal,
            parseDelta: (data) => {
                const delta = JSON.parse(data).choices[0].delta;
                return { content: delta.content };
            },
            onAbortReader,
        })).rejects.toBe(abortReason);

        expect(onAbortReader).toHaveBeenCalledOnce();
    });
});
