import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateAuthSessionOwner } from '@/context/authSessionBoundary';
import { useAIWorkbenchDraft } from '../useAIWorkbenchDraft';

let session = 0;
beforeEach(() => { updateAuthSessionOwner('draft-user-a', `draft-session-${++session}`); });
afterEach(() => { cleanup(); updateAuthSessionOwner(null); });

describe('AI workbench draft across sidebar changes', () => {
    it('retains selection mode and an unsent message when the sidebar unmounts and returns', () => {
        const first = renderHook(() => useAIWorkbenchDraft('draft-user-a', 'diagram-a'));
        act(() => {
            first.result.current.setEditScope('selection');
            first.result.current.setInputValue('Only update the selected review node');
        });
        first.unmount();
        const returned = renderHook(() => useAIWorkbenchDraft('draft-user-a', 'diagram-a'));
        expect(returned.result.current.editScope).toBe('selection');
        expect(returned.result.current.inputValue).toBe('Only update the selected review node');
    });

    it('does not carry a scoped draft into a different document', () => {
        const hook = renderHook(({ id }) => useAIWorkbenchDraft('draft-user-a', id), { initialProps: { id: 'diagram-a' } });
        act(() => { hook.result.current.setEditScope('selection'); hook.result.current.setInputValue('Draft for A'); });
        hook.rerender({ id: 'diagram-b' });
        expect(hook.result.current.editScope).toBe('generate');
        expect(hook.result.current.inputValue).toBe('');
        hook.rerender({ id: 'diagram-a' });
        expect(hook.result.current.editScope).toBe('selection');
    });

    it('clears drafts at the account boundary and rejects writes from the old session', () => {
        const hook = renderHook(() => useAIWorkbenchDraft('draft-user-a', 'diagram-a'));
        act(() => { hook.result.current.setInputValue('Private unsent draft'); });
        const staleSetter = hook.result.current.setInputValue;
        act(() => { updateAuthSessionOwner('draft-user-b', 'other-session'); staleSetter('Must not survive'); });
        const other = renderHook(() => useAIWorkbenchDraft('draft-user-b', 'diagram-a'));
        expect(other.result.current.inputValue).toBe('');
        act(() => { updateAuthSessionOwner('draft-user-a', 'new-session'); });
        const returned = renderHook(() => useAIWorkbenchDraft('draft-user-a', 'diagram-a'));
        expect(returned.result.current.inputValue).toBe('');
    });
});
