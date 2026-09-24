import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { areAIConfigDraftsEqual } from './aiConfigDraftState';
import { getAIConfig, type AIConfigState } from './aiConfigStorage';

interface AIConfigModalDraftControls {
    isDirty: boolean;
    markSaved: (savedConfig: AIConfigState) => boolean;
    replaceConfigIfPristine: (config: AIConfigState) => boolean;
}

interface AIConfigModalState {
    sourceKey: string | null;
    config: AIConfigState;
    baseline: AIConfigState;
}

export const useAIConfigModalConfig = (
    open: boolean,
    userId: string | undefined,
): [AIConfigState, Dispatch<SetStateAction<AIConfigState>>, AIConfigModalDraftControls] => {
    const configSourceKey = open ? (userId ?? '__anonymous__') : null;
    const [state, setState] = useState<AIConfigModalState>(() => {
        const config = getAIConfig(userId);
        return { sourceKey: configSourceKey, config, baseline: config };
    });
    const stateRef = useRef(state);
    let currentState = state;

    if (state.sourceKey !== configSourceKey) {
        const config = configSourceKey === null ? state.config : getAIConfig(userId);
        currentState = {
            sourceKey: configSourceKey,
            config,
            baseline: configSourceKey === null ? state.baseline : config,
        };
        setState(currentState);
    }

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const setConfig = useCallback<Dispatch<SetStateAction<AIConfigState>>>((update) => {
        const previous = stateRef.current;
        const config = typeof update === 'function' ? update(previous.config) : update;
        const next = { ...previous, config };
        stateRef.current = next;
        setState(next);
    }, []);

    const markSaved = useCallback((savedConfig: AIConfigState): boolean => {
        const previous = stateRef.current;
        const next = { ...previous, baseline: savedConfig };
        stateRef.current = next;
        setState(next);
        return areAIConfigDraftsEqual(previous.config, savedConfig);
    }, []);

    const replaceConfigIfPristine = useCallback((config: AIConfigState): boolean => {
        const previous = stateRef.current;
        if (!areAIConfigDraftsEqual(previous.config, previous.baseline)) return false;
        const next = { ...previous, config, baseline: config };
        stateRef.current = next;
        setState(next);
        return true;
    }, []);

    return [
        currentState.config,
        setConfig,
        {
            isDirty: !areAIConfigDraftsEqual(currentState.config, currentState.baseline),
            markSaved,
            replaceConfigIfPristine,
        },
    ];
};
