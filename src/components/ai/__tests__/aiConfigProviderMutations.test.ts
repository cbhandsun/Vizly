import { describe, expect, it } from 'vitest';

import { createCustomAIProvider } from '../aiConfigProviderMutations';

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
