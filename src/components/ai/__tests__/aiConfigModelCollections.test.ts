import { describe, expect, it } from 'vitest';

import type { AIModel, AIProviderConfig } from '../aiConfigStorage';
import {
    filterAIModels,
    filterAIProviders,
    groupAIModels,
} from '../aiConfigModelCollections';

const models: AIModel[] = [
    { id: 'gpt-vision', name: 'Vision Model', group: 'Vision', enabled: true },
    { id: 'text-basic', name: 'Basic Text', group: '', enabled: false },
];

describe('AI config model collections', () => {
    it('filters providers case-insensitively and trims the query', () => {
        const providers = [
            { id: 'openai', name: 'OpenAI', enabled: true, baseUrl: '', apiKey: '', models: [] },
            { id: 'local', name: 'Local Runtime', enabled: true, baseUrl: '', apiKey: '', models: [] },
        ] satisfies AIProviderConfig[];

        expect(filterAIProviders(providers, ' OPEN ')).toEqual([providers[0]]);
        expect(filterAIProviders(providers, '')).toEqual(providers);
    });

    it('filters models by id or display name', () => {
        expect(filterAIModels(models, 'VISION')).toEqual([models[0]]);
        expect(filterAIModels(models, 'basic text')).toEqual([models[1]]);
        expect(filterAIModels(models, 'missing')).toEqual([]);
    });

    it('groups blank model groups under Other without mutating input', () => {
        const snapshot = structuredClone(models);

        expect(groupAIModels(models)).toEqual({
            Vision: [models[0]],
            Other: [models[1]],
        });
        expect(models).toEqual(snapshot);
        expect(groupAIModels([])).toEqual({});
    });
});
