import type { AIConfigState, AIModel, AIProviderConfig } from './aiConfigStorage';
import {
    getAIProviderConnectionReadiness,
    type AIProviderConnectionIssue,
} from './aiProviderConnectionReadiness';

export interface AIChatResolvedModelSelection {
    provider: AIProviderConfig | null;
    model: AIModel | null;
    nextConfig: AIConfigState;
    autoSwitched: boolean;
}

export type AIChatRequestValidationResult =
    | { ok: true; provider: AIProviderConfig; model: AIModel }
    | { ok: false; reason: 'missing-model' | 'missing-api-key' | 'invalid-endpoint' };

export type AIChatConfigurationState =
    | { ready: true; providerName: string }
    | {
        ready: false;
        reason: 'missing-model' | AIProviderConnectionIssue;
        providerName?: string;
    };

const findFirstEnabledModelSelection = (
    providers: AIProviderConfig[]
): { provider: AIProviderConfig; model: AIModel } | null => {
    for (const provider of providers) {
        if (!provider.enabled) continue;
        const enabledModel = provider.models.find((model) => model.enabled);
        if (enabledModel) {
            return { provider, model: enabledModel };
        }
    }

    return null;
};

export const resolveAIChatActiveModelSelection = (
    config: AIConfigState
): AIChatResolvedModelSelection => {
    const parts = (config.activeModelKey || '').split(':');
    const providerId = parts[0];
    const modelId = parts.slice(1).join(':');

    const provider = config.providers.find((item) => item.id === providerId) ?? null;
    const model = provider?.models.find((item) => item.id === modelId) ?? null;

    if (provider?.enabled && model?.enabled) {
        return {
            provider,
            model,
            nextConfig: config,
            autoSwitched: false,
        };
    }

    const fallbackSelection = findFirstEnabledModelSelection(config.providers);
    if (!fallbackSelection) {
        return {
            provider: null,
            model: null,
            nextConfig: config,
            autoSwitched: false,
        };
    }

    return {
        provider: fallbackSelection.provider,
        model: fallbackSelection.model,
        nextConfig: {
            ...config,
            activeModelKey: `${fallbackSelection.provider.id}:${fallbackSelection.model.id}`,
        },
        autoSwitched: true,
    };
};

export const getAIChatConfigurationState = (
    config: AIConfigState,
): AIChatConfigurationState => {
    const selection = resolveAIChatActiveModelSelection(config);
    if (!selection.provider || !selection.model) {
        return { ready: false, reason: 'missing-model' };
    }

    const readiness = getAIProviderConnectionReadiness(selection.provider);
    if (!readiness.ready) {
        return {
            ready: false,
            reason: readiness.issue,
            providerName: selection.provider.name,
        };
    }

    return {
        ready: true,
        providerName: selection.provider.name,
    };
};

export const validateAIChatRequestSelection = (
    selection: Pick<AIChatResolvedModelSelection, 'provider' | 'model'>,
    resolveEndpoint: (provider: AIProviderConfig) => void
): AIChatRequestValidationResult => {
    if (!selection.provider || !selection.model) {
        return {
            ok: false,
            reason: 'missing-model',
        };
    }

    const readiness = getAIProviderConnectionReadiness(selection.provider);
    if (!readiness.ready && readiness.issue === 'missing-api-key') {
        return {
            ok: false,
            reason: 'missing-api-key',
        };
    }

    try {
        resolveEndpoint(selection.provider);
    } catch {
        return {
            ok: false,
            reason: 'invalid-endpoint',
        };
    }

    return {
        ok: true,
        provider: selection.provider,
        model: selection.model,
    };
};
