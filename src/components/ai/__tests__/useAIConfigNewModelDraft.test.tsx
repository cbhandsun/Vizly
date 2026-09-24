import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAIConfigNewModelDraft } from '../useAIConfigNewModelDraft';

describe('useAIConfigNewModelDraft', () => {
    it('starts every add flow empty and clears the subdraft on reset', () => {
        const { result } = renderHook(() => useAIConfigNewModelDraft());

        act(() => result.current.show());
        act(() => result.current.setDraft({ id: 'stale-model', name: 'Stale', group: 'Old' }));
        expect(result.current.visible).toBe(true);

        act(() => result.current.reset());
        expect(result.current.visible).toBe(false);
        expect(result.current.draft).toEqual({ id: '', name: '', group: '' });

        act(() => result.current.show());
        expect(result.current.draft).toEqual({ id: '', name: '', group: '' });
    });
});
