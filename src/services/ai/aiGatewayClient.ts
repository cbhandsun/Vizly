import { fetchWithTimeout } from '@/core/utils/boundedResponse';
import { buildSupabaseFunctionUrl } from '@/services/runtimeEnv';
import {
    AIProviderInvalidRequestError,
    assertAIProviderResponseOk,
    serializeAIProviderRequestBody,
    type AIProviderRequestConfig,
    type AIProviderRequestOptions,
} from './aiProviderClient';

const AI_GATEWAY_FUNCTION_NAME = 'ai-gateway';
const AI_GATEWAY_PROTOCOL = 'vizly-ai-gateway-v1';
const MAX_JWT_CHARS = 16 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const requireGatewayToken = (value: unknown): string => {
    if (typeof value !== 'string'
        || !value
        || value.length > MAX_JWT_CHARS
        || /[\r\n]/.test(value)) {
        throw new AIProviderInvalidRequestError('AI Gateway 需要有效的登录会话。');
    }
    return value;
};

const requireGatewayEndpoint = (supabaseUrl: unknown): string => {
    const endpoint = buildSupabaseFunctionUrl(supabaseUrl, AI_GATEWAY_FUNCTION_NAME);
    if (!endpoint) {
        throw new AIProviderInvalidRequestError('AI Gateway 尚未配置。');
    }
    return endpoint;
};

const parseChatBody = (body: unknown): { model: string; messages: unknown[] } => {
    if (!isRecord(body)
        || typeof body.model !== 'string'
        || !body.model.trim()
        || !Array.isArray(body.messages)) {
        throw new AIProviderInvalidRequestError('AI Gateway 请求缺少有效的模型或消息。');
    }
    return { model: body.model.trim(), messages: body.messages };
};

export interface AIGatewayRequestOptions extends AIProviderRequestOptions {
    supabaseUrl: unknown;
    jwtToken: unknown;
    fetchImplementation?: typeof fetch;
}

export async function probeAIGateway(
    options: AIGatewayRequestOptions,
): Promise<boolean> {
    const endpoint = requireGatewayEndpoint(options.supabaseUrl);
    const jwtToken = requireGatewayToken(options.jwtToken);
    try {
        const response = await fetchWithTimeout(`${endpoint}?health=1`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${jwtToken}` },
            timeoutMs: Math.min(options.timeoutMs ?? 5_000, 10_000),
            signal: options.signal,
            fetchImplementation: options.fetchImplementation,
        });
        return response.ok
            && response.headers.get('X-Vizly-AI-Gateway') === AI_GATEWAY_PROTOCOL;
    } catch {
        return false;
    }
}

export async function requestAIGatewayChatCompletion(
    provider: AIProviderRequestConfig,
    body: unknown,
    options: AIGatewayRequestOptions,
): Promise<Response> {
    const endpoint = requireGatewayEndpoint(options.supabaseUrl);
    const jwtToken = requireGatewayToken(options.jwtToken);
    const chatBody = parseChatBody(body);
    const serializedBody = serializeAIProviderRequestBody({
        provider: {
            id: provider.id,
            name: provider.name,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
        },
        model: chatBody.model,
        messages: chatBody.messages,
        toolMode: 'diagram',
    });

    const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
        },
        body: serializedBody,
        timeoutMs: options.timeoutMs ?? 120_000,
        signal: options.signal,
        fetchImplementation: options.fetchImplementation,
    });
    await assertAIProviderResponseOk(response);
    return response;
}
