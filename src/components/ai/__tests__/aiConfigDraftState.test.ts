import { describe, expect, it } from 'vitest';
import type { AIConfigState } from '../aiConfigStorage';
import { areAIConfigDraftsEqual } from '../aiConfigDraftState';

const makeConfig = (): AIConfigState => ({
    activeModelKey: 'provider:model',
    systemPrompt: 'prompt',
    providers: [{
        id: 'provider',
        name: 'Provider',
        enabled: true,
        baseUrl: 'https://example.com/v1',
        apiKey: 'secret',
        icon: 'deployment-unit',
        models: [{ id: 'model', name: 'Model', group: 'Custom', enabled: true, isCustom: true }],
    }],
});

describe('areAIConfigDraftsEqual', () => {
    it('treats structurally identical independent drafts as equal', () => {
        expect(areAIConfigDraftsEqual(makeConfig(), makeConfig())).toBe(true);
    });

    it.each([
        ['system prompt', (config: AIConfigState) => { config.systemPrompt = 'changed'; }],
        ['active model', (config: AIConfigState) => { config.activeModelKey = ''; }],
        ['provider secret', (config: AIConfigState) => { config.providers[0].apiKey = 'changed'; }],
        ['provider order', (config: AIConfigState) => { config.providers.unshift({ ...config.providers[0], id: 'other' }); }],
        ['model state', (config: AIConfigState) => { config.providers[0].models[0].enabled = false; }],
    ])('detects a changed %s', (_label, mutate) => {
        const left = makeConfig();
        const right = makeConfig();
        mutate(right);
        expect(areAIConfigDraftsEqual(left, right)).toBe(false);
    });
});
