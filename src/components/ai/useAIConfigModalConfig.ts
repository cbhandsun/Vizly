import { useState, type Dispatch, type SetStateAction } from 'react';
import { getAIConfig, type AIConfigState } from './aiConfigStorage';

export const useAIConfigModalConfig = (
    open: boolean,
    userId: string | undefined,
): [AIConfigState, Dispatch<SetStateAction<AIConfigState>>] => {
    const [config, setConfig] = useState<AIConfigState>(() => getAIConfig(userId));
    const configSourceKey = open ? (userId ?? '__anonymous__') : null;
    const [loadedConfigSourceKey, setLoadedConfigSourceKey] = useState<string | null>(configSourceKey);

    if (loadedConfigSourceKey !== configSourceKey) {
        setLoadedConfigSourceKey(configSourceKey);
        if (configSourceKey !== null) {
            setConfig(getAIConfig(userId));
        }
    }

    return [config, setConfig];
};
