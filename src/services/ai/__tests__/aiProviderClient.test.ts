import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AIProviderHttpError,
    AIProviderInvalidResponseError,
    AIProviderTimeoutError,
    createAIProviderHeaders,
    formatAIProviderRequestError,
    normalizeAIModelsResponse,
    requestAIChatCompletionJson,
    requestAIChatCompletion,
    requestAIModels,
    resolveAIProviderEndpoint,
} from '../aiProviderClient';

const provider = {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/',
    apiKey: 'sk-live-secret-value',
};

describe('aiProviderClient', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('accepts HTTPS and rejects non-local HTTP endpoints', () => {
        expect(resolveAIProviderEndpoint(provider, '/chat/completions')).toBe('https://api.openai.com/v1/chat/completions');
        expect(resolveAIProviderEndpoint({ ...provider, baseUrl: 'http://localhost:11434/v1' }, '/models')).toBe('http://localhost:11434/v1/models');
        expect(() => resolveAIProviderEndpoint({ ...provider, baseUrl: 'http://evil.example/v1' }, '/models')).toThrow(/Base URL/);
        expect(() => resolveAIProviderEndpoint({ ...provider, baseUrl: 'https://user:pass@api.openai.com/v1' }, '/models')).toThrow(/Base URL/);
    });

    it('creates JSON and Authorization headers without mutating provider config', () => {
        const headers = createAIProviderHeaders(provider, { json: true });

        expect(headers).toEqual({
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-live-secret-value',
        });
        expect(provider.apiKey).toBe('sk-live-secret-value');
    });

    it('redacts provider error bodies before throwing HTTP errors', async () => {
        const makeErrorResponse = () => new Response(
            'failed Authorization: Bearer leaked-token api_key=sk-live-secret-value',
            { status: 401 }
        );
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(makeErrorResponse())
            .mockResolvedValueOnce(makeErrorResponse());

        await expect(requestAIChatCompletion(provider, { model: 'gpt-4o', messages: [] })).rejects.toMatchObject({
            status: 401,
        });

        try {
            await requestAIChatCompletion(provider, { model: 'gpt-4o', messages: [] });
        } catch (error) {
            expect(error).toBeInstanceOf(AIProviderHttpError);
            const formatted = formatAIProviderRequestError(error, 120);
            expect(formatted).toContain('AI 接口错误 401');
            expect(formatted).not.toContain('leaked-token');
            expect(formatted).not.toContain('sk-live-secret-value');
        }
    });

    it('fetches provider models through the normalized models endpoint', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ data: [{ id: 'gpt-4o' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));

        await expect(requestAIModels(provider)).resolves.toEqual({ data: [{ id: 'gpt-4o' }] });
        expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
            method: 'GET',
            headers: { Authorization: 'Bearer sk-live-secret-value' },
            signal: expect.any(AbortSignal),
        }));
    });

    it('rejects invalid JSON provider responses with user-safe errors', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('<html>not an API</html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            }))
            .mockResolvedValueOnce(new Response('plain text', {
                status: 200,
                headers: { 'Content-Type': 'text/plain' },
            }));

        await expect(requestAIModels(provider)).rejects.toBeInstanceOf(AIProviderInvalidResponseError);

        try {
            await requestAIChatCompletionJson(provider, { model: 'gpt-4o', messages: [] });
        } catch (error) {
            expect(error).toBeInstanceOf(AIProviderInvalidResponseError);
            expect(formatAIProviderRequestError(error)).toContain('不是 JSON');
        }
    });

    it('normalizes model discovery responses before UI import', () => {
        expect(normalizeAIModelsResponse({
            data: [
                { id: 'gpt-4o' },
                { id: 'gpt-4o' },
                { id: '../bad' },
                { id: 'model with spaces' },
                { id: 'vendor/model-1' },
                { id: 'x'.repeat(200) },
                null,
            ],
        })).toEqual([
            { id: 'gpt-4o' },
            { id: 'vendor/model-1' },
        ]);
        expect(normalizeAIModelsResponse({ data: { id: 'bad' } })).toEqual([]);
    });

    it('aborts slow requests with a formatted timeout error', async () => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));

        const request = requestAIChatCompletion(provider, { model: 'gpt-4o', messages: [] }, { timeoutMs: 50 })
            .catch(error => error);
        await vi.advanceTimersByTimeAsync(50);

        const error = await request;
        expect(error).toBeInstanceOf(AIProviderTimeoutError);
        expect(formatAIProviderRequestError(error)).toContain('请求超时');
        expect(formatAIProviderRequestError(error)).toContain('1 秒');
    });

    it('propagates caller aborts without converting them to timeout errors', async () => {
        const controller = new AbortController();
        vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));

        const request = requestAIModels(provider, { signal: controller.signal, timeoutMs: 10_000 });
        controller.abort(new Error('user cancelled'));

        await expect(request).rejects.toThrow('user cancelled');
    });
});
