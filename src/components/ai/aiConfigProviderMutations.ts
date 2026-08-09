import type { AIConfigState, AIProviderConfig } from './aiConfigStorage';

export const createCustomAIProvider = (id: string, name: string): AIProviderConfig => ({
    id,
    name,
    enabled: true,
    baseUrl: '',
    apiKey: '',
    icon: 'deployment-unit',
    models: [],
});

const findFallbackActiveModelKey = (providers: AIProviderConfig[]): string => {
    for (const provider of providers) {
        if (!provider.enabled) continue;
        const enabledModel = provider.models.find(model => model.enabled);
        if (enabledModel) return `${provider.id}:${enabledModel.id}`;
    }

    return '';
};

export const removeAIProvider = (
    config: AIConfigState,
    providerId: string,
): AIConfigState => {
    const provider = config.providers.find(candidate => candidate.id === providerId);
    if (!provider) return config;

    const providers = config.providers.filter(candidate => candidate.id !== providerId);
    const removesActiveModel = provider.models.some(
        model => config.activeModelKey === `${provider.id}:${model.id}`,
    );

    return {
        ...config,
        providers,
        activeModelKey: removesActiveModel
            ? findFallbackActiveModelKey(providers)
            : config.activeModelKey,
    };
};

export const removeAIModel = (
    config: AIConfigState,
    providerId: string,
    modelId: string,
): AIConfigState => {
    const provider = config.providers.find(candidate => candidate.id === providerId);
    if (!provider?.models.some(model => model.id === modelId)) return config;

    const providers = config.providers.map(candidate => candidate.id === providerId
        ? { ...candidate, models: candidate.models.filter(model => model.id !== modelId) }
        : candidate);
    const removesActiveModel = config.activeModelKey === `${providerId}:${modelId}`;

    return {
        ...config,
        providers,
        activeModelKey: removesActiveModel
            ? findFallbackActiveModelKey(providers)
            : config.activeModelKey,
    };
};
