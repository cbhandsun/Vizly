import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';
import { captureAuthSession, getAuthSessionRevision, onAuthSessionInvalidated } from '@/context/authSessionBoundary';
import type { AIEditScope } from './aiCanvasEdit';

interface WorkbenchDraft { editScope: AIEditScope; inputValue: string }
const empty: Readonly<WorkbenchDraft> = Object.freeze({ editScope: 'generate', inputValue: '' });
const drafts = new Map<string, Readonly<WorkbenchDraft>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
onAuthSessionInvalidated(() => { drafts.clear(); notify(); });

/** Keep unsent UI state through sidebar tab switches, in memory only. */
export function useAIWorkbenchDraft(userId: string | undefined, diagramId: string | undefined) {
    const revision = useSyncExternalStore(onAuthSessionInvalidated, getAuthSessionRevision, getAuthSessionRevision);
    const key = JSON.stringify([userId ?? null, diagramId ?? null]);
    const read = useCallback(() => drafts.get(key) ?? empty, [key]);
    const draft = useSyncExternalStore(subscribe, read, read);
    const commit = useCallback((update: (previous: Readonly<WorkbenchDraft>) => Readonly<WorkbenchDraft>) => {
        if (revision !== getAuthSessionRevision() || !captureAuthSession(userId).isCurrent()) return;
        const previous = read(), next = update(previous);
        if (next === previous) return;
        drafts.delete(key);
        drafts.set(key, next);
        while (drafts.size > 32) drafts.delete(drafts.keys().next().value!);
        notify();
    }, [key, read, userId, revision]);
    const setEditScope = useCallback((update: SetStateAction<AIEditScope>) => commit(previous => {
        const editScope = typeof update === 'function' ? update(previous.editScope) : update;
        return editScope === previous.editScope ? previous : { ...previous, editScope };
    }), [commit]);
    const setInputValue = useCallback((update: SetStateAction<string>) => commit(previous => {
        const inputValue = typeof update === 'function' ? update(previous.inputValue) : update;
        return inputValue === previous.inputValue ? previous : { ...previous, inputValue };
    }), [commit]);
    return { ...draft, setEditScope, setInputValue };
}
