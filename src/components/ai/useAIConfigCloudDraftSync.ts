import { useEffect } from 'react';
import { loadCloudAIConfig, restoreRememberedAIConfig, setRuntimeAIConfig, type AIConfigState } from './aiConfigStorage';
import { logAIConfigModalCloudLoadFailure } from './aiLogging';

export const useAIConfigCloudDraftSync = (
    open: boolean,
    userId: string | undefined,
    replaceConfigIfPristine: (config: AIConfigState) => boolean,
) => {
    useEffect(() => {
        if (!open) return undefined;
        let active = true;

        (userId ? loadCloudAIConfig(userId) : restoreRememberedAIConfig(userId)).then((mergedConfig) => {
            if (active && mergedConfig && replaceConfigIfPristine(mergedConfig)) {
                setRuntimeAIConfig(userId, mergedConfig);
                window.dispatchEvent(new Event('aiConfigChanged'));
            }
        }).catch(error => {
            if (active) logAIConfigModalCloudLoadFailure(error);
        });

        return () => { active = false; };
    }, [open, replaceConfigIfPristine, userId]);
};
