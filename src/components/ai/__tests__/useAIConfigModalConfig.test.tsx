import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearRuntimeAIConfig, persistAIConfig, type AIConfigState } from '../aiConfigStorage';
import { useAIConfigModalConfig } from '../useAIConfigModalConfig';

const createConfig = (systemPrompt: string): AIConfigState => ({
    activeModelKey: 'provider:model',
    systemPrompt,
    providers: [{
        id: 'provider',
        name: 'Provider',
        enabled: true,
        baseUrl: 'https://example.com/v1',
        apiKey: '',
        models: [{ id: 'model', name: 'Model', enabled: true }],
    }],
});

beforeEach(() => {
    localStorage.clear();
    clearRuntimeAIConfig();
    persistAIConfig(undefined, createConfig('saved'));
});

afterEach(() => {
    localStorage.clear();
    clearRuntimeAIConfig();
});

describe('useAIConfigModalConfig', () => {
    it('tracks edits, marks the exact saved snapshot, and preserves edits made during saving', () => {
        const { result } = renderHook(() => useAIConfigModalConfig(true, undefined));
        expect(result.current[2].isDirty).toBe(false);

        act(() => result.current[1](previous => ({ ...previous, systemPrompt: 'first edit' })));
        const savedSnapshot = result.current[0];
        act(() => result.current[1](previous => ({ ...previous, systemPrompt: 'edit during save' })));

        let fullySaved = true;
        act(() => { fullySaved = result.current[2].markSaved(savedSnapshot); });
        expect(fullySaved).toBe(false);
        expect(result.current[2].isDirty).toBe(true);
        expect(result.current[0].systemPrompt).toBe('edit during save');

        act(() => { fullySaved = result.current[2].markSaved(result.current[0]); });
        expect(fullySaved).toBe(true);
        expect(result.current[2].isDirty).toBe(false);
    });

    it('applies an external cloud value only while the local draft is pristine', () => {
        const { result } = renderHook(() => useAIConfigModalConfig(true, undefined));
        let replaced = false;

        act(() => { replaced = result.current[2].replaceConfigIfPristine(createConfig('cloud')); });
        expect(replaced).toBe(true);
        expect(result.current[0].systemPrompt).toBe('cloud');

        act(() => result.current[1](previous => ({ ...previous, systemPrompt: 'local edit' })));
        act(() => { replaced = result.current[2].replaceConfigIfPristine(createConfig('late cloud')); });
        expect(replaced).toBe(false);
        expect(result.current[0].systemPrompt).toBe('local edit');
    });

    it('reloads the persisted configuration after the modal closes and reopens', () => {
        const { result, rerender } = renderHook(
            ({ open }) => useAIConfigModalConfig(open, undefined),
            { initialProps: { open: true } },
        );
        act(() => result.current[1](previous => ({ ...previous, systemPrompt: 'discard me' })));
        rerender({ open: false });
        rerender({ open: true });

        expect(result.current[0].systemPrompt).toBe('saved');
        expect(result.current[2].isDirty).toBe(false);
    });
});
