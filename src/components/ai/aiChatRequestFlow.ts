import { AIStreamProtocolError, AI_STREAM_SSE_DATA_MAX_CHARS } from './aiStreamParsing';
import { AIProviderTimeoutError } from '@/services/ai/aiProviderClient';
import type { Message } from '@/services/ai/AIConversationService';
import type { AIValidatedCommand } from './aiCommandExtraction';

export interface AIChatRequestMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface BuildAIChatRequestMessagesOptions {
    systemPrompt: string;
    pluginId?: string;
    historyMessages: Pick<Message, 'role' | 'content'>[];
    userContent: string;
}

export interface AIChatStreamDelta {
    content?: string;
    reasoningContent?: string;
    toolCalls?: AIValidatedCommand[];
}

export interface AIChatStreamState {
    content: string;
    reasoningContent: string;
    toolCalls: AIValidatedCommand[];
}

export interface ConsumeAIChatStreamOptions {
    reader: ReadableStreamDefaultReader<Uint8Array>;
    signal: AbortSignal;
    parseDelta: (data: string) => AIChatStreamDelta | null;
    onAbortReader: () => void;
    onDelta?: (state: AIChatStreamState) => void;
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
}

export const buildAIChatRequestMessages = ({
    systemPrompt,
    pluginId,
    historyMessages,
    userContent,
}: BuildAIChatRequestMessagesOptions): AIChatRequestMessage[] => [
    {
        role: 'system',
        content: systemPrompt + (pluginId ? `\n\n[当前图表模式: ${pluginId}]` : ''),
    },
    ...historyMessages.map((message) => ({
        role: message.role,
        content: message.content,
    })),
    {
        role: 'user',
        content: userContent,
    },
];

export const consumeAIChatStream = async ({
    reader,
    signal,
    parseDelta,
    onAbortReader,
    onDelta,
    idleTimeoutMs = 30_000,
    totalTimeoutMs = 120_000,
}: ConsumeAIChatStreamOptions): Promise<AIChatStreamState> => {
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoningContent = '';
    const toolCalls: AIValidatedCommand[] = [];
    let finished = false;
    let lastProgressAt = Date.now();
    const deadline = lastProgressAt + totalTimeoutMs;
    const maxTextChars = 1024 * 1024;

    const applySseData = (data: string) => {
        if (data === '[DONE]') { finished = true; return; }
        if (data.length > AI_STREAM_SSE_DATA_MAX_CHARS) throw new AIStreamProtocolError('AI 流式消息过大。');

        const delta = parseDelta(data);
        if (!delta) return;

        if (delta.reasoningContent) {
            reasoningContent += delta.reasoningContent;
        }
        if (delta.content) {
            content += delta.content;
        }
        if (delta.toolCalls?.length) {
            toolCalls.push(...delta.toolCalls.slice(0, Math.max(0, 10 - toolCalls.length)));
        }

        if (content.length + reasoningContent.length > maxTextChars) {
            throw new AIStreamProtocolError('AI 流式响应超过大小限制。');
        }
        lastProgressAt = Date.now();
        onDelta?.({
            content,
            reasoningContent,
            toolCalls: [...toolCalls],
        });
    };

    let eventData: string[] = [];
    let eventChars = 0;
    const flushEvent = () => {
        if (eventData.length) applySseData(eventData.join('\n'));
        eventData = []; eventChars = 0;
    };
    const applySseLine = (rawLine: string) => {
        const line = rawLine.replace(/\r$/, '');
        if (!line) { flushEvent(); return; }
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).replace(/^ /, '');
        if (data === '[DONE]') { flushEvent(); finished = true; return; }
        eventChars += data.length + 1;
        if (eventChars > AI_STREAM_SSE_DATA_MAX_CHARS) throw new AIStreamProtocolError('AI SSE event is too large.');
        eventData.push(data);
    };

    signal.addEventListener('abort', onAbortReader, { once: true });

    try {
        while (true) {
            if (signal.aborted) {
                throw signal.reason;
            }

            const waitMs = Math.min(idleTimeoutMs - (Date.now() - lastProgressAt), deadline - Date.now());
            if (waitMs <= 0) throw new AIProviderTimeoutError(totalTimeoutMs);
            let timer: ReturnType<typeof setTimeout> | undefined;
            let abortRead: (() => void) | undefined;
            const next = await Promise.race([
                reader.read(),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new AIProviderTimeoutError(waitMs)), waitMs);
                    abortRead = () => reject(signal.reason);
                    signal.addEventListener('abort', abortRead, { once: true });
                    if (signal.aborted) abortRead();
                }),
            ]).finally(() => {
                clearTimeout(timer);
                if (abortRead) signal.removeEventListener('abort', abortRead);
            });
            const { done, value } = next;
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            if (buffer.length > maxTextChars) throw new AIStreamProtocolError('AI 流式缓冲区超过大小限制。');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                applySseLine(line);
                if (finished) break;
            }
            if (finished) break;
        }

        buffer += decoder.decode();
        if (!finished && buffer.trim()) {
            applySseLine(buffer);
        }

        if (!finished) flushEvent();
        if (signal.aborted) {
            throw signal.reason;
        }

        return {
            content,
            reasoningContent,
            toolCalls,
        };
    } finally {
        signal.removeEventListener('abort', onAbortReader);
        // DONE may arrive before the server closes its connection. Never wait
        // for that close, and close the reader on failure/timeout as well.
        void reader.cancel?.().catch(() => undefined);
        reader.releaseLock?.();
    }
};
