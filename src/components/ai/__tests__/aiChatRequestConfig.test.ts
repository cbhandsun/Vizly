import { describe, expect, it, vi } from 'vitest';
import type { AIConfigState } from '../aiConfigStorage';
import {
    getAIChatConfigurationState,
    resolveAIChatActiveModelSelection,
    validateAIChatRequestSelection,
} from '../aiChatRequestConfig';
import { getAIProviderConnectionReadiness } from '../aiProviderConnectionReadiness';

const makeConfig = (overrides: Partial<AIConfigState> = {}): AIConfigState => ({
    activeModelKey: 'openai:gpt-4o',
    systemPrompt: 'system',
    providers: [
        {
            id: 'openai',
            name: 'OpenAI',
            enabled: true,
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            models: [
                { id: 'gpt-4o', name: 'GPT-4o', enabled: true },
                { id: 'gpt-4o:mini', name: 'GPT-4o Mini', enabled: true },
            ],
        },
        {
            id: 'gemini',
            name: 'Gemini',
            enabled: true,
            baseUrl: 'https://example.com',
            apiKey: 'gem-key',
            models: [{ id: 'gemini-2.0', name: 'Gemini 2.0', enabled: true }],
        },
    ],
    ...overrides,
});

describe('aiChatRequestConfig', () => {
    it('resolves the configured provider and model directly', () => {
        const config = makeConfig();

        const selection = resolveAIChatActiveModelSelection(config);

        expect(selection.provider?.id).toBe('openai');
        expect(selection.model?.id).toBe('gpt-4o');
        expect(selection.autoSwitched).toBe(false);
        expect(selection.nextConfig).toBe(config);
    });

    it('preserves model ids containing colons', () => {
        const config = makeConfig({
            activeModelKey: 'openai:gpt-4o:mini',
        });

        const selection = resolveAIChatActiveModelSelection(config);

        expect(selection.provider?.id).toBe('openai');
        expect(selection.model?.id).toBe('gpt-4o:mini');
    });

    it('falls back to the first enabled provider/model when the active one is missing', () => {
        const config = makeConfig({
            activeModelKey: 'missing:model',
        });

        const selection = resolveAIChatActiveModelSelection(config);

        expect(selection.autoSwitched).toBe(true);
        expect(selection.provider?.id).toBe('openai');
        expect(selection.model?.id).toBe('gpt-4o');
        expect(selection.nextConfig.activeModelKey).toBe('openai:gpt-4o');
    });

    it('returns missing-model when no enabled fallback exists', () => {
        const config = makeConfig({
            activeModelKey: 'missing:model',
            providers: [{
                id: 'openai',
                name: 'OpenAI',
                enabled: false,
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
                models: [{ id: 'gpt-4o', name: 'GPT-4o', enabled: true }],
            }],
        });

        const selection = resolveAIChatActiveModelSelection(config);
        const validation = validateAIChatRequestSelection(selection, vi.fn());

        expect(selection.provider).toBeNull();
        expect(selection.model).toBeNull();
        expect(validation).toEqual({
            ok: false,
            reason: 'missing-model',
        });
    });

    it('returns missing-api-key when the selected provider is not configured', () => {
        const config = makeConfig({
            providers: [{
                ...makeConfig().providers[0],
                apiKey: '',
            }],
        });

        const selection = resolveAIChatActiveModelSelection(config);
        const validation = validateAIChatRequestSelection(selection, vi.fn());

        expect(validation).toEqual({
            ok: false,
            reason: 'missing-api-key',
        });
    });

    it.each([
        { baseUrl: '   ', apiKey: '', issue: 'missing-base-url' },
        { baseUrl: 'http://remote.example/v1', apiKey: 'secret', issue: 'invalid-base-url' },
        { baseUrl: 'https://user:pass@example.com/v1', apiKey: 'secret', issue: 'invalid-base-url' },
        { baseUrl: 'https://api.example.com/v1', apiKey: '   ', issue: 'missing-api-key' },
    ] as const)('rejects incomplete or unsafe provider settings: $issue', ({ baseUrl, apiKey, issue }) => {
        expect(getAIProviderConnectionReadiness({ baseUrl, apiKey })).toMatchObject({
            ready: false,
            issue,
        });
    });

    it.each([
        'http://localhost:11434/v1/',
        'http://127.0.0.1:11434/v1',
        'http://[::1]:11434/v1',
    ])('allows local providers without a bearer key: %s', (baseUrl) => {
        const readiness = getAIProviderConnectionReadiness({ baseUrl, apiKey: '   ' });

        expect(readiness).toMatchObject({
            ready: true,
            authMode: 'optional-local',
        });
    });

    it('allows chat validation for a local provider without a key', () => {
        const localConfig = makeConfig({
            providers: [{
                ...makeConfig().providers[0],
                baseUrl: 'http://localhost:11434/v1',
                apiKey: '',
            }],
        });
        const selection = resolveAIChatActiveModelSelection(localConfig);
        const resolveEndpoint = vi.fn();

        expect(validateAIChatRequestSelection(selection, resolveEndpoint).ok).toBe(true);
        expect(resolveEndpoint).toHaveBeenCalledWith(selection.provider);
    });

    it('exposes a recoverable configuration reason for the chat entry point', () => {
        const config = makeConfig({
            providers: [{
                ...makeConfig().providers[0],
                apiKey: '',
            }],
        });

        expect(getAIChatConfigurationState(config)).toEqual({
            ready: false,
            reason: 'missing-api-key',
            providerName: 'OpenAI',
        });
    });

    it('does not select a disabled active provider when an enabled fallback exists', () => {
        const config = makeConfig({
            providers: [
                { ...makeConfig().providers[0], enabled: false },
                makeConfig().providers[1],
            ],
        });

        const selection = resolveAIChatActiveModelSelection(config);

        expect(selection.autoSwitched).toBe(true);
        expect(selection.provider?.id).toBe('gemini');
        expect(selection.model?.id).toBe('gemini-2.0');
    });

    it('returns invalid-endpoint when endpoint resolution fails', () => {
        const selection = resolveAIChatActiveModelSelection(makeConfig());
        const validation = validateAIChatRequestSelection(selection, () => {
            throw new Error('bad endpoint');
        });

        expect(validation).toEqual({
            ok: false,
            reason: 'invalid-endpoint',
        });
    });

    it('passes validation when the request selection is fully configured', () => {
        const selection = resolveAIChatActiveModelSelection(makeConfig());
        const resolveEndpoint = vi.fn();

        const validation = validateAIChatRequestSelection(selection, resolveEndpoint);

        expect(validation).toEqual({
            ok: true,
            provider: selection.provider,
            model: selection.model,
        });
        expect(resolveEndpoint).toHaveBeenCalledWith(selection.provider);
    });
});
