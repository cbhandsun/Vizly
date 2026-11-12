import { describe, expect, it } from 'vitest';
import type { AIConfigState } from '../aiConfigStorage';
import { areAIConfigDraftsEqual, getAIProviderCredentialDisplayState } from '../aiConfigDraftState';

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

describe('credential display for saved settings and browser-filled drafts', () => {
    it('does not claim the session is ready when an unsaved browser-filled secret differs', () => {
        const committed = makeConfig();
        const draft = { ...committed.providers[0], apiKey: 'synthetic-browser-filled-value' };
        expect(getAIProviderCredentialDisplayState(draft, committed)).toBe('draft');
        expect(committed.providers[0].apiKey).toBe('secret');
    });

    it('requires saving before a credential for a different endpoint is ready', () => {
        const committed = makeConfig();
        const draft = { ...committed.providers[0], baseUrl: 'https://other.example/v1' };
        expect(getAIProviderCredentialDisplayState(draft, committed)).toBe('draft');
    });

    it('reports a committed credential as ready and never trusts a stale ready flag after clearing', () => {
        const committed = makeConfig();
        expect(getAIProviderCredentialDisplayState(committed.providers[0], committed)).toBe('ready');
        expect(getAIProviderCredentialDisplayState({ ...committed.providers[0], apiKey: '', credentialState: 'ready' }, committed)).toBe('required');
    });
});

describe('areAIConfigDraftsEqual', () => {
    it('treats structurally identical independent drafts as equal', () => {
        expect(areAIConfigDraftsEqual(makeConfig(), makeConfig())).toBe(true);
    });

    it.each([
        ['system prompt', (config: AIConfigState) => { config.systemPrompt = 'changed'; }],
        ['active model', (config: AIConfigState) => { config.activeModelKey = ''; }],
        ['local key storage preference', (config: AIConfigState) => { config.providers[0].rememberKey = true; }],
        ['provider transport', (config: AIConfigState) => { config.providers[0].transport = 'direct'; }],
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
