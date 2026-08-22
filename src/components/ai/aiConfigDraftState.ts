import type { AIConfigState } from './aiConfigStorage';

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
