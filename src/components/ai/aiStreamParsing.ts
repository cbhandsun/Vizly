import { sanitizeValidatedAICommand, type AIValidatedCommand } from './aiCommandExtraction';

export const AI_STREAM_SSE_DATA_MAX_CHARS = 512 * 1024;
export const AI_STREAM_DELTA_TEXT_MAX_CHARS = 20_000;

export interface AIStreamDelta {
    content?: string;
    reasoningContent?: string;
    toolCalls?: AIValidatedCommand[];
}

export class AIStreamProtocolError extends Error {
    constructor(message = 'AI Gateway 流式响应失败。') {
        super(message);
        this.name = 'AIStreamProtocolError';
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    !!value && typeof value === 'object' && !Array.isArray(value)
);

const boundedString = (value: unknown): string | undefined => (
    typeof value === 'string'
        ? value.slice(0, AI_STREAM_DELTA_TEXT_MAX_CHARS)
        : undefined
);

export const parseAIStreamDelta = (data: string): AIStreamDelta | null => {
    if (!data || data === '[DONE]' || data.length > AI_STREAM_SSE_DATA_MAX_CHARS) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(data);
    } catch {
        return null;
    }

    if (!isRecord(parsed)) return null;

    if (isRecord(parsed.vizly)) {
        if (parsed.vizly.type === 'error') throw new AIStreamProtocolError();
        if (parsed.vizly.type !== 'tool-call'
            || typeof parsed.vizly.toolName !== 'string'
            || !isRecord(parsed.vizly.input)) {
            return null;
        }
        const command = sanitizeValidatedAICommand({
            action: parsed.vizly.toolName,
            ...parsed.vizly.input,
        });
        return command ? { toolCalls: [command] } : null;
    }

    if (!Array.isArray(parsed.choices)) return null;
    const firstChoice = parsed.choices[0];
    if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) return null;

    const content = boundedString(firstChoice.delta.content);
    const reasoningContent = boundedString(firstChoice.delta.reasoning_content)
        ?? boundedString(firstChoice.delta.reasoning)
        ?? boundedString(firstChoice.delta.thinking);
    if (content === undefined && reasoningContent === undefined) return null;

    return {
        ...(content !== undefined ? { content } : {}),
        ...(reasoningContent !== undefined ? { reasoningContent } : {}),
    };
};
