import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type MouseEvent,
    type RefObject,
    type SetStateAction,
} from 'react';

import type { AIConfigState, AIModel, AIProviderConfig } from './aiConfigStorage';
import { removeAIModel, removeAIProvider } from './aiConfigProviderMutations';

export type PendingAIConfigDeletion =
    | {
        kind: 'provider';
        providerId: string;
        providerName: string;
        modelCount: number;
    }
    | {
        kind: 'model';
        providerId: string;
        modelId: string;
        modelName: string;
        isActive: boolean;
    };

interface UseAIConfigDeletionOptions {
    fallbackFocusRef: RefObject<HTMLElement | null>;
    setConfig: Dispatch<SetStateAction<AIConfigState>>;
    setSelectedProviderId: Dispatch<SetStateAction<string>>;
}

export const useAIConfigDeletion = ({
    fallbackFocusRef,
    setConfig,
    setSelectedProviderId,
}: UseAIConfigDeletionOptions) => {
    const [pendingDeletion, setPendingDeletion] = useState<PendingAIConfigDeletion | null>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const wasPendingRef = useRef(false);

    useEffect(() => {
        const wasPending = wasPendingRef.current;
        wasPendingRef.current = pendingDeletion !== null;
        if (!wasPending || pendingDeletion !== null) return;

        queueMicrotask(() => {
            const trigger = triggerRef.current;
            triggerRef.current = null;
            if (trigger?.isConnected) {
                trigger.focus();
            } else {
                fallbackFocusRef.current?.focus();
            }
        });
    }, [fallbackFocusRef, pendingDeletion]);

    const requestProviderDeletion = useCallback((
        provider: AIProviderConfig,
        event: MouseEvent<HTMLElement>,
    ) => {
        triggerRef.current = event.currentTarget;
        setPendingDeletion({
            kind: 'provider',
            providerId: provider.id,
            providerName: provider.name,
            modelCount: provider.models.length,
        });
    }, []);

    const requestModelDeletion = useCallback((
        providerId: string,
        model: AIModel,
        isActive: boolean,
        event: MouseEvent<HTMLElement>,
    ) => {
        triggerRef.current = event.currentTarget;
        setPendingDeletion({
            kind: 'model',
            providerId,
            modelId: model.id,
            modelName: model.name || model.id,
            isActive,
        });
    }, []);

    const cancelDeletion = useCallback(() => setPendingDeletion(null), []);

    const confirmDeletion = useCallback(() => {
        if (!pendingDeletion) return;
        if (pendingDeletion.kind === 'provider') {
            setConfig(config => removeAIProvider(config, pendingDeletion.providerId));
            setSelectedProviderId('global_settings');
        } else {
            setConfig(config => removeAIModel(
                config,
                pendingDeletion.providerId,
                pendingDeletion.modelId,
            ));
        }
        setPendingDeletion(null);
    }, [pendingDeletion, setConfig, setSelectedProviderId]);

    return {
        pendingDeletion,
        requestProviderDeletion,
        requestModelDeletion,
        cancelDeletion,
        confirmDeletion,
    };
};
