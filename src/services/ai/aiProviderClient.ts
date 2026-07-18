import { getProviderEndpoint } from './providerSecurity';
import { sanitizeAIProviderError } from './errorSecurity';

export type AIProviderRequestPath = '/chat/completions' | '/models';

export interface AIProviderRequestConfig {
    name?: string;
    baseUrl: string;
    apiKey?: string;
}

export interface AIProviderRequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 5 * 60_000;
export const AI_PROVIDER_REQUEST_BODY_MAX_CHARS = 2 * 1024 * 1024;
const MAX_AI_MODELS = 200;
const MAX_AI_MODEL_ID_LENGTH = 160;
const MAX_AI_JSON_RESPONSE_CHARS = 1024 * 1024;
const MAX_AI_ERROR_RESPONSE_CHARS = 16 * 1024;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,159}$/;

export class AIProviderHttpError extends Error {
    status: number;
    isHtml: boolean;

    constructor(status: number, message: string, isHtml = false) {
        super(message);
        this.name = 'AIProviderHttpError';
        this.status = status;
        this.isHtml = isHtml;
    }
}

export class AIProviderTimeoutError extends Error {
    timeoutMs: number;

    constructor(timeoutMs: number) {
        super(`AI Provider request timed out after ${timeoutMs}ms`);
        this.name = 'AIProviderTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}

export class AIProviderInvalidResponseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AIProviderInvalidResponseError';
    }
}

export class AIProviderInvalidRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AIProviderInvalidRequestError';
    }
}

export class AIProviderResponseTooLargeError extends Error {
    maxChars: number;

    constructor(maxChars: number) {
        super(`AI Provider response exceeded ${maxChars} characters`);
        this.name = 'AIProviderResponseTooLargeError';
        this.maxChars = maxChars;
    }
}

export function resolveAIProviderEndpoint(
    provider: AIProviderRequestConfig,
    path: AIProviderRequestPath
): string {
    const endpoint = getProviderEndpoint(provider.baseUrl, path);
    if (!endpoint) {
        throw new Error(`${provider.name || 'AI Provider'} 的 Base URL 必须使用 HTTPS，或本机 HTTP localhost/127.0.0.1。`);
    }
    return endpoint;
}

export function createAIProviderHeaders(
    provider: AIProviderRequestConfig,
    options: { json?: boolean } = {}
): HeadersInit {
    return {
        ...(options.json ? { 'Content-Type': 'application/json' } : {}),
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    };
}

async function readResponseTextWithLimit(response: Response, maxChars: number): Promise<string> {
    const contentLength = Number(response.headers.get('Content-Length') || '0');
    if (Number.isFinite(contentLength) && contentLength > maxChars) {
        throw new AIProviderResponseTooLargeError(maxChars);
    }

    if (!response.body) {
        const text = await response.text();
        if (text.length > maxChars) {
            throw new AIProviderResponseTooLargeError(maxChars);
        }
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            if (text.length > maxChars) {
                throw new AIProviderResponseTooLargeError(maxChars);
            }
        }
        text += decoder.decode();
        if (text.length > maxChars) {
            throw new AIProviderResponseTooLargeError(maxChars);
        }
        return text;
    } finally {
        reader.releaseLock();
    }
}

export async function assertAIProviderResponseOk(response: Response): Promise<void> {
    if (response.ok) return;

    let errText: string;
    try {
        errText = await readResponseTextWithLimit(response, MAX_AI_ERROR_RESPONSE_CHARS);
    } catch (error) {
        if (error instanceof AIProviderResponseTooLargeError) {
            throw new AIProviderHttpError(
                response.status,
                `API 错误响应过大 (${response.status})。请检查 Base URL 或代理服务。`
            );
        }
        throw error;
    }
    if (errText.trim().startsWith('<')) {
        throw new AIProviderHttpError(
            response.status,
            `API 返回了 HTML 错误页 (${response.status})。请检查 Base URL。`,
            true
        );
    }

    throw new AIProviderHttpError(response.status, sanitizeAIProviderError(errText));
}

async function readAIProviderJson(response: Response): Promise<unknown> {
    const contentType = response.headers.get('Content-Type') || '';
    const rawText = await readResponseTextWithLimit(response, MAX_AI_JSON_RESPONSE_CHARS);
    const trimmed = rawText.trim();

    if (trimmed.startsWith('<')) {
        throw new AIProviderInvalidResponseError('API 返回了 HTML 响应。请检查 Base URL。');
    }

    if (contentType && !contentType.toLowerCase().includes('application/json') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new AIProviderInvalidResponseError('API 返回的不是 JSON 响应。请检查 Base URL。');
    }

    try {
        return JSON.parse(trimmed || 'null');
    } catch {
        throw new AIProviderInvalidResponseError('API 返回的 JSON 无法解析。');
    }
}

export interface NormalizedAIModel {
    id: string;
}

export function normalizeAIModelsResponse(value: unknown): NormalizedAIModel[] {
    const input = value && typeof value === 'object' ? value as { data?: unknown } : {};
    if (!Array.isArray(input.data)) return [];

    const seen = new Set<string>();
    return input.data
        .flatMap((model): NormalizedAIModel[] => {
            if (!model || typeof model !== 'object') return [];
            const id = String((model as { id?: unknown }).id ?? '').trim();
            if (!id || id.length > MAX_AI_MODEL_ID_LENGTH || !MODEL_ID_PATTERN.test(id) || seen.has(id)) {
                return [];
            }
            seen.add(id);
            return [{ id }];
        })
        .slice(0, MAX_AI_MODELS);
}

export function serializeAIProviderRequestBody(body: unknown): string {
    let serialized: string | undefined;
    try {
        serialized = JSON.stringify(body);
    } catch {
        throw new AIProviderInvalidRequestError('AI 请求内容无法序列化为 JSON。');
    }

    if (serialized === undefined) {
        throw new AIProviderInvalidRequestError('AI 请求内容必须是可序列化的 JSON。');
    }
    if (serialized.length > AI_PROVIDER_REQUEST_BODY_MAX_CHARS) {
        throw new AIProviderInvalidRequestError(
            `AI 请求内容超过 ${AI_PROVIDER_REQUEST_BODY_MAX_CHARS} 字符限制。`
        );
    }
    return serialized;
}

export function coerceAIProviderTimeoutMs(value: unknown): number {
    if (value === undefined) return DEFAULT_TIMEOUT_MS;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
        throw new AIProviderInvalidRequestError(`AI Provider timeoutMs 必须是 1 到 ${MAX_TIMEOUT_MS} 的整数。`);
    }
    return value;
}

async function withRequestTimeout<T>(
    options: AIProviderRequestOptions,
    request: (signal: AbortSignal) => Promise<T>
): Promise<T> {
    const timeoutMs = coerceAIProviderTimeoutMs(options.timeoutMs);
    const controller = new AbortController();
    let timedOut = false;

    if (options.signal?.aborted) {
        controller.abort(options.signal.reason);
    }

    const onExternalAbort = () => {
        controller.abort(options.signal?.reason);
    };
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort(new AIProviderTimeoutError(timeoutMs));
    }, timeoutMs);

    try {
        return await request(controller.signal);
    } catch (error) {
        if (timedOut) {
            throw new AIProviderTimeoutError(timeoutMs);
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
        options.signal?.removeEventListener('abort', onExternalAbort);
    }
}

export async function requestAIChatCompletion(
    provider: AIProviderRequestConfig,
    body: unknown,
    options: AIProviderRequestOptions = {}
): Promise<Response> {
    const serializedBody = serializeAIProviderRequestBody(body);
    return withRequestTimeout(options, async (signal) => {
        const response = await fetch(resolveAIProviderEndpoint(provider, '/chat/completions'), {
            method: 'POST',
            headers: createAIProviderHeaders(provider, { json: true }),
            body: serializedBody,
            signal,
        });

        await assertAIProviderResponseOk(response);
        return response;
    });
}

export async function requestAIModels(
    provider: AIProviderRequestConfig,
    options: AIProviderRequestOptions = {}
): Promise<unknown> {
    return withRequestTimeout(options, async (signal) => {
        const response = await fetch(resolveAIProviderEndpoint(provider, '/models'), {
            method: 'GET',
            headers: createAIProviderHeaders(provider),
            signal,
        });

        await assertAIProviderResponseOk(response);
        return readAIProviderJson(response);
    });
}

export async function requestAIChatCompletionJson<T = any>(
    provider: AIProviderRequestConfig,
    body: unknown,
    options: AIProviderRequestOptions = {}
): Promise<T> {
    const response = await requestAIChatCompletion(provider, body, options);
    return readAIProviderJson(response) as Promise<T>;
}

export function formatAIProviderRequestError(error: unknown, maxLength = 240): string {
    if (error instanceof AIProviderTimeoutError) {
        const seconds = Math.max(1, Math.round(error.timeoutMs / 1000));
        return `请求超时：AI Provider 在 ${seconds} 秒内没有响应，请稍后重试或检查网络/模型服务状态。`;
    }

    if (error instanceof AIProviderHttpError) {
        return error.isHtml
            ? error.message
            : `AI 接口错误 ${error.status}: ${sanitizeAIProviderError(error.message, maxLength)}`;
    }

    if (error instanceof AIProviderInvalidResponseError) {
        return sanitizeAIProviderError(error.message, maxLength);
    }

    if (error instanceof AIProviderInvalidRequestError) {
        return sanitizeAIProviderError(error.message, maxLength);
    }

    return `请求失败：${sanitizeAIProviderError(error, maxLength)}`;
}
