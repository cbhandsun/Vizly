import { sanitizeValidatedAICommand, type AIValidatedCommand } from './aiCommandExtraction';

export const AI_STREAM_SSE_DATA_MAX_CHARS = 512 * 1024;
export const AI_STREAM_DELTA_TEXT_MAX_CHARS = AI_STREAM_SSE_DATA_MAX_CHARS;

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

const boundedString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    if (value.length > AI_STREAM_DELTA_TEXT_MAX_CHARS) throw new AIStreamProtocolError('AI 流式文本过大。');
    return value;
};

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
        if (parsed.vizly.type === 'error') {
            const messages: Record<string, string> = {
                'upstream-auth': '模型服务拒绝网关访问，请检查密钥权限或服务端访问限制。',
                'upstream-limit': '模型服务限流或额度不足，请稍后重试。',
                'upstream-http': '模型服务返回接口错误，请检查模型及服务兼容性。',
                'upstream-route': '上游入口返回通用路由 404，请检查服务地址及公网转发配置。',
                'upstream-network': '云端网关无法连接模型服务，请检查服务端网络可达性。',
                'upstream-protocol': '模型返回的流式协议不兼容，请检查服务适配器。',
            };
            const code = typeof parsed.vizly.code === 'string' ? parsed.vizly.code : '';
            const status = typeof parsed.vizly.status === 'number' && Number.isInteger(parsed.vizly.status)
                && parsed.vizly.status >= 400 && parsed.vizly.status <= 599 ? ` (${parsed.vizly.status})` : '';
            const endpoint = typeof parsed.vizly.endpoint === 'string'
                && ['/chat/completions', '/v1/chat/completions', '/responses', '/v1/responses', 'other'].includes(parsed.vizly.endpoint)
                ? ` [${parsed.vizly.endpoint}]` : '';
            throw new AIStreamProtocolError(Object.hasOwn(messages, code) ? messages[code] + status + endpoint : undefined);
        }
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
