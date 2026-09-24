import type { AIModel, AIProviderConfig } from './aiConfigStorage';

const includesSearchText = (value: string, searchText: string): boolean => (
    value.toLowerCase().includes(searchText.trim().toLowerCase())
);

export const filterAIProviders = (
    providers: readonly AIProviderConfig[],
    searchText: string,
): AIProviderConfig[] => (
    providers.filter((provider) => includesSearchText(provider.name, searchText))
);

export const filterAIModels = (
    models: readonly AIModel[],
    searchText: string,
): AIModel[] => (
    models.filter((model) => (
        includesSearchText(model.id, searchText)
        || includesSearchText(model.name, searchText)
    ))
);

export const groupAIModels = (models: readonly AIModel[]): Record<string, AIModel[]> => {
    const groups: Record<string, AIModel[]> = {};
    for (const model of models) {
        const group = model.group || 'Other';
        (groups[group] ??= []).push(model);
    }
    return groups;
};
