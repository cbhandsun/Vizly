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
}: ConsumeAIChatStreamOptions): Promise<AIChatStreamState> => {
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoningContent = '';
    const toolCalls: AIValidatedCommand[] = [];

    const applySseLine = (line: string) => {
        const trimmedLine = line.trim();
        if (!trimmedLine.startsWith('data: ')) return;

        const data = trimmedLine.slice(6);
        if (data === '[DONE]') return;

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

        onDelta?.({
            content,
            reasoningContent,
            toolCalls: [...toolCalls],
        });
    };

    signal.addEventListener('abort', onAbortReader, { once: true });

    try {
        while (true) {
            if (signal.aborted) {
                throw signal.reason;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                applySseLine(line);
            }
        }

        if (buffer.trim()) {
            applySseLine(buffer);
        }

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
    }
};
