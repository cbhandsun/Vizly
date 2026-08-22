import { describe, expect, it } from 'vitest';

import type { AIConfigState } from '../aiConfigStorage';
import {
    createCustomAIProvider,
    removeAIModel,
    removeAIProvider,
    resolveAIConfigInitialProviderId,
    selectAIActiveModelDraft,
} from '../aiConfigProviderMutations';

const config: AIConfigState = {
    activeModelKey: 'custom-one:active-model',
    systemPrompt: 'prompt',
    providers: [
        {
            id: 'custom-one',
            name: 'Custom One',
            enabled: true,
            baseUrl: 'https://one.example/v1',
            apiKey: '',
            models: [
                { id: 'active-model', name: 'Active Model', enabled: true },
                { id: 'next-model', name: 'Next Model', enabled: true },
            ],
        },
        {
            id: 'custom-two',
            name: 'Custom Two',
            enabled: true,
            baseUrl: 'https://two.example/v1',
            apiKey: '',
            models: [{ id: 'fallback-model', name: 'Fallback Model', enabled: true }],
        },
    ],
};

describe('createCustomAIProvider', () => {
    it('creates an enabled provider without credentials or models', () => {
        expect(createCustomAIProvider('custom-1', 'Custom Provider')).toEqual({
            id: 'custom-1',
            name: 'Custom Provider',
            enabled: true,
            baseUrl: '',
            apiKey: '',
            icon: 'deployment-unit',
            models: [],
        });
    });

    it('preserves an empty translated name without inventing external input', () => {
        expect(createCustomAIProvider('custom-2', '').name).toBe('');
    });
});

describe('AI config deletion mutations', () => {
    it('removes a provider and selects the first remaining enabled model when it owned the active model', () => {
        const next = removeAIProvider(config, 'custom-one');

        expect(next.providers.map(provider => provider.id)).toEqual(['custom-two']);
        expect(next.activeModelKey).toBe('custom-two:fallback-model');
    });

    it('preserves the active model when deleting an unrelated provider', () => {
        const next = removeAIProvider(config, 'custom-two');

        expect(next.activeModelKey).toBe('custom-one:active-model');
    });

    it('removes the active model and deterministically selects the next enabled model', () => {
        const next = removeAIModel(config, 'custom-one', 'active-model');

        expect(next.providers[0].models.map(model => model.id)).toEqual(['next-model']);
        expect(next.activeModelKey).toBe('custom-one:next-model');
    });

    it('clears the active selection when no enabled models remain', () => {
        const onlyDisabledFallback: AIConfigState = {
            ...config,
            providers: [{
                ...config.providers[0],
                models: [
                    { id: 'active-model', name: 'Active Model', enabled: true },
                    { id: 'disabled-model', name: 'Disabled Model', enabled: false },
                ],
            }],
        };

        expect(removeAIModel(onlyDisabledFallback, 'custom-one', 'active-model').activeModelKey).toBe('');
    });

    it('returns the original config for unknown provider and model targets', () => {
        expect(removeAIProvider(config, 'missing-provider')).toBe(config);
        expect(removeAIModel(config, 'custom-one', 'missing-model')).toBe(config);
    });
});

describe('resolveAIConfigInitialProviderId', () => {
    it('accepts only an existing provider id', () => {
        expect(resolveAIConfigInitialProviderId('custom-two', config.providers)).toBe('custom-two');
    });

    it.each([
        undefined,
        null,
        '',
        'missing-provider',
        'x'.repeat(161),
        42,
    ])('falls back to global settings for invalid input: %s', (input) => {
        expect(resolveAIConfigInitialProviderId(input, config.providers)).toBe('global_settings');
    });
});

describe('selectAIActiveModelDraft', () => {
    it('stages an enabled model selection without mutating the source config', () => {
        const next = selectAIActiveModelDraft(config, 'custom-one', 'next-model');
        expect(next).not.toBe(config);
        expect(next.activeModelKey).toBe('custom-one:next-model');
        expect(config.activeModelKey).toBe('custom-one:active-model');
    });

    it('rejects unknown and disabled provider or model selections', () => {
        const disabledProvider = {
            ...config,
            providers: config.providers.map(provider => provider.id === 'custom-one'
                ? { ...provider, enabled: false }
                : provider),
        };
        const disabledModel = {
            ...config,
            providers: config.providers.map(provider => provider.id === 'custom-one'
                ? { ...provider, models: provider.models.map(model => ({ ...model, enabled: false })) }
                : provider),
        };

        expect(selectAIActiveModelDraft(config, 'missing', 'model')).toBe(config);
        expect(selectAIActiveModelDraft(disabledProvider, 'custom-one', 'next-model')).toBe(disabledProvider);
        expect(selectAIActiveModelDraft(disabledModel, 'custom-one', 'next-model')).toBe(disabledModel);
    });
});
