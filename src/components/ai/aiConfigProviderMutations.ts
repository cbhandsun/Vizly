import type { AIProviderConfig } from './aiConfigStorage';

export const createCustomAIProvider = (id: string, name: string): AIProviderConfig => ({
    id,
    name,
    enabled: true,
    baseUrl: '',
    apiKey: '',
    icon: 'deployment-unit',
    models: [],
});
