import { describe, expect, it, vi } from 'vitest';
import {
    buildAIChatRequestMessages,
    consumeAIChatStream,
} from '../aiChatRequestFlow';

const encodeLines = (...lines: string[]): Uint8Array =>
    new TextEncoder().encode(lines.join('\n\n'));

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

    it('stops at DONE without reading or applying subsequent content', async () => {
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

        expect(state.content).toBe('A');
        expect(reader.read).toHaveBeenCalledOnce();
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
    it('accepts data fields without a space and split UTF-8 chunks', async () => {
        const bytes = encodeLines('data:{"content":"你好"}', 'data:[DONE]', '');
        const reader = new ReadableStream<Uint8Array>({ start(c) {
            for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
            c.close();
        } }).getReader();
        const state = await consumeAIChatStream({ reader, signal: new AbortController().signal,
            parseDelta: JSON.parse, onAbortReader: vi.fn() });
        expect(state.content).toBe('你好');
    });

    it('times out and cancels a stalled stream', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const reader = new ReadableStream<Uint8Array>({ cancel }).getReader();
        const pending = consumeAIChatStream({ reader, signal: new AbortController().signal,
            parseDelta: JSON.parse, onAbortReader: vi.fn(), idleTimeoutMs: 10 });
        const assertion = expect(pending).rejects.toMatchObject({ name: 'AIProviderTimeoutError' });
        await vi.advanceTimersByTimeAsync(11);
        await assertion;
        expect(cancel).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });

    it('joins multiline data events and ignores comments and event metadata', async () => {
        const reader = new ReadableStream<Uint8Array>({ start(c) {
            c.enqueue(new TextEncoder().encode(': heartbeat\r\nevent: message\r\ndata:{"content":\r\ndata: "multi-line"}\r\n\r\ndata:[DONE]\r\n\r\n'));
            c.close();
        } }).getReader();
        const state = await consumeAIChatStream({ reader, signal: new AbortController().signal,
            parseDelta: JSON.parse, onAbortReader: vi.fn() });
        expect(state.content).toBe('multi-line');
    });

    it('does not let keepalive comments extend the semantic idle timeout', async () => {
        vi.useFakeTimers();
        let streamController!: ReadableStreamDefaultController<Uint8Array>;
        const reader = new ReadableStream<Uint8Array>({ start(c) { streamController = c; } }).getReader();
        const pending = consumeAIChatStream({ reader, signal: new AbortController().signal,
            parseDelta: JSON.parse, onAbortReader: vi.fn(), idleTimeoutMs: 10 });
        const assertion = expect(pending).rejects.toMatchObject({ name: 'AIProviderTimeoutError' });
        await vi.advanceTimersByTimeAsync(6);
        streamController.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        await vi.advanceTimersByTimeAsync(5);
        await assertion;
        vi.useRealTimers();
    });

});
