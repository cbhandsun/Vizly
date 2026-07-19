import { describe, expect, it, vi } from 'vitest';
import type { AIConfigState } from '../aiConfigStorage';
import {
    resolveAIChatActiveModelSelection,
    validateAIChatRequestSelection,
} from '../aiChatRequestConfig';

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
