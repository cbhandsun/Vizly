import type { AIConfigState, AIProviderConfig } from './aiConfigStorage';
import { normalizeProviderBaseUrl } from '@/services/ai/providerSecurity';

/** A populated draft (including browser autofill) is not a committed session credential. */
export const getAIProviderCredentialDisplayState = (
    draft: AIProviderConfig,
    committed: AIConfigState,
): NonNullable<AIProviderConfig['credentialState']> | 'draft' => {
    const key = draft.apiKey.trim();
    if (!key) return draft.credentialState === 'ready' ? 'required' : draft.credentialState ?? 'unconfigured';
    const current = committed.providers.find(provider => provider.id === draft.id);
    const endpoint = normalizeProviderBaseUrl(draft.baseUrl);
    return current && endpoint && endpoint === normalizeProviderBaseUrl(current.baseUrl)
        && key === current.apiKey.trim() ? 'ready' : 'draft';
};

export const areAIConfigDraftsEqual = (
    left: AIConfigState,
    right: AIConfigState,
): boolean => {
    if (left.activeModelKey !== right.activeModelKey) return false;
    if (left.systemPrompt !== right.systemPrompt) return false;
    if (left.providers.length !== right.providers.length) return false;

    return left.providers.every((provider, providerIndex) => {
        const other = right.providers[providerIndex];
        if (!other) return false;
        if (
            provider.id !== other.id
            || provider.name !== other.name
            || provider.enabled !== other.enabled
            || provider.baseUrl !== other.baseUrl
            || provider.apiKey !== other.apiKey
            || provider.transport !== other.transport
            || Boolean(provider.rememberKey) !== Boolean(other.rememberKey)
            || provider.credentialState !== other.credentialState
            || provider.icon !== other.icon
            || provider.models.length !== other.models.length
        ) return false;

        return provider.models.every((model, modelIndex) => {
            const otherModel = other.models[modelIndex];
            return Boolean(otherModel)
                && model.id === otherModel.id
                && model.name === otherModel.name
                && model.group === otherModel.group
                && model.enabled === otherModel.enabled
                && model.isCustom === otherModel.isCustom;
        });
    });
};
