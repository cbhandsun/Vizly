import { captureAuthSession, invalidateAuthSessionWork, onAuthSessionInvalidated } from '@/context/authSessionBoundary';
import { normalizeProviderBaseUrl } from '@/services/ai/providerSecurity';
import { logAIConfigStorageFailure } from './aiLogging';

export interface AIModel {
    id: string;
    name: string;
    group?: string;
    enabled: boolean;
    isCustom?: boolean;
}

export interface AIProviderConfig {
    id: string;
    name: string;
    enabled: boolean;
    baseUrl: string;
    transport?: 'direct';
    apiKey: string;
    credentialState?: 'unconfigured' | 'required' | 'legacy-unavailable' | 'ready';
    icon?: string;
    models: AIModel[];
}

export interface AIConfigState {
    activeModelKey: string;
    systemPrompt: string;
    providers: AIProviderConfig[];
}

export const AI_CONFIG_KEY = 'DiagramView.AIConfig_V3_Session';
export const AI_CLOUD_CONFIG_KEY = 'ai_config_v3';
const LEGACY_CONFIG_KEY = 'DiagramView.AIConfig_V2_Advanced';

const DEFAULT_SYSTEM_PROMPT = '';

const DEFAULT_PROVIDERS: AIProviderConfig[] = [
    {
        id: 'gemini',
        name: 'Gemini (Google)',
        enabled: true,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: '',
        icon: 'google',
        models: [
            { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', enabled: true, group: 'Google' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', enabled: true, group: 'Google' }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        enabled: false,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        icon: 'openai',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o', enabled: true, group: 'GPT-4' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: true, group: 'GPT-4' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', enabled: true, group: 'GPT-3.5' }
        ]
    },
    {
        id: 'siliconflow',
        name: '硅基流动 (SiliconFlow)',
        enabled: false,
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: '',
        icon: 'chip',
        models: [
            { id: 'deepseek-ai/DeepSeek-V2.5', name: 'DeepSeek V2.5', enabled: true, group: 'DeepSeek' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', enabled: true, group: 'Qwen' }
        ]
    },
    {
        id: 'o3',
        name: 'O3 Platform',
        enabled: false,
        baseUrl: 'https://api.o3.fan/v1',
        apiKey: '',
        icon: 'o3',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o (O3)', enabled: true, group: 'OpenAI' },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', enabled: true, group: 'Anthropic' }
        ]
    }
];

export const getAIConfigKey = (userId?: string | null): string => {
    return userId ? `${AI_CONFIG_KEY}_${userId}` : `${AI_CONFIG_KEY}_anonymous`;
};

const runtimeAIConfigs = new Map<string, AIConfigState>();
let revision = 0;
onAuthSessionInvalidated(() => {
    runtimeAIConfigs.clear();
    revision += 1;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('aiConfigChanged'));
});

const MAX_PROVIDERS = 20;
const MAX_MODELS_PER_PROVIDER = 200;
const MAX_ID_LENGTH = 160;
export const AI_CONFIG_NAME_MAX_LENGTH = 160;
const MAX_SECRET_LENGTH = 8_000;
export const AI_SYSTEM_PROMPT_MAX_LENGTH = 20_000;
const SAFE_ID = /^[\w:./@-]+$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeAIText = (value: unknown, fallback: string, maxLength = AI_CONFIG_NAME_MAX_LENGTH): string => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim().slice(0, maxLength);
    return trimmed || fallback;
};

const normalizeAIId = (value: unknown, fallback: string): string => {
    const text = normalizeAIText(value, fallback, MAX_ID_LENGTH);
    return SAFE_ID.test(text) ? text : fallback;
};

const cloneAIConfig = (config: AIConfigState): AIConfigState => ({
    ...config,
    providers: config.providers.map(provider => ({
        ...provider,
        models: provider.models.map(model => ({ ...model }))
    }))
});

const getDefaultAIConfig = (): AIConfigState => cloneAIConfig({
    activeModelKey: 'gemini:gemini-2.0-flash-exp',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    providers: DEFAULT_PROVIDERS
});

export const coerceAIConfig = (value: unknown): AIConfigState => {
    const defaults = getDefaultAIConfig();
    if (!isRecord(value)) return defaults;

    const providers = Array.isArray(value.providers)
        ? value.providers
            .slice(0, MAX_PROVIDERS)
            .map((rawProvider, providerIndex): AIProviderConfig | null => {
                if (!isRecord(rawProvider)) return null;

                const id = normalizeAIId(rawProvider.id, `provider-${providerIndex}`);
                const name = normalizeAIText(rawProvider.name, id);
                const rawBaseUrl = typeof rawProvider.baseUrl === 'string' ? rawProvider.baseUrl : '';
                const baseUrl = rawBaseUrl ? (normalizeProviderBaseUrl(rawBaseUrl) ?? '') : '';
                const apiKey = typeof rawProvider.apiKey === 'string'
                    ? rawProvider.apiKey.trim().slice(0, MAX_SECRET_LENGTH)
                    : '';

                const models = Array.isArray(rawProvider.models)
                    ? rawProvider.models
                        .slice(0, MAX_MODELS_PER_PROVIDER)
                        .map((rawModel, modelIndex): AIModel | null => {
                            if (!isRecord(rawModel)) return null;

                            const modelId = normalizeAIId(rawModel.id, `model-${modelIndex}`);
                            return {
                                id: modelId,
                                name: normalizeAIText(rawModel.name, modelId),
                                ...(typeof rawModel.group === 'string' ? { group: normalizeAIText(rawModel.group, 'Custom') } : {}),
                                enabled: rawModel.enabled !== false,
                                ...(rawModel.isCustom === true ? { isCustom: true } : {}),
                            };
                        })
                        .filter((model): model is AIModel => Boolean(model))
                    : [];

                return {
                    id,
                    name,
                    enabled: rawProvider.enabled === true,
                    baseUrl,
                    ...(rawProvider.transport === 'direct' ? { transport: 'direct' as const } : {}),
                    apiKey,
                    credentialState: apiKey ? 'ready' : (rawProvider.credentialState === 'required' || rawProvider.credentialState === 'legacy-unavailable' ? rawProvider.credentialState : 'unconfigured'),
                    ...(typeof rawProvider.icon === 'string' ? { icon: normalizeAIText(rawProvider.icon, '') } : {}),
                    models,
                };
            })
            .filter((provider): provider is AIProviderConfig => Boolean(provider))
        : [];

    const normalizedProviders = providers.length > 0 ? providers : defaults.providers;
    const modelKeys = new Set(normalizedProviders.flatMap(provider => provider.models.map(model => `${provider.id}:${model.id}`)));
    const fallbackActiveModelKey = normalizedProviders
        .flatMap(provider => provider.models.map(model => `${provider.id}:${model.id}`))[0]
        ?? defaults.activeModelKey;
    const requestedActiveModelKey = normalizeAIText(value.activeModelKey, fallbackActiveModelKey, MAX_ID_LENGTH * 2 + 1);

    return {
        activeModelKey: modelKeys.has(requestedActiveModelKey) ? requestedActiveModelKey : fallbackActiveModelKey,
        systemPrompt: typeof value.systemPrompt === 'string'
            ? value.systemPrompt.slice(0, AI_SYSTEM_PROMPT_MAX_LENGTH)
            : DEFAULT_SYSTEM_PROMPT,
        providers: normalizedProviders,
    };
};

export const parseStoredAIConfig = (raw: string | null | undefined): unknown | null => {
    if (!raw) return null;
    if (raw.length > 2 * 1024 * 1024) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        logAIConfigStorageFailure('parseStoredAIConfig', error);
        return null;
    }
};

export const stripAIConfigSecrets = (config: AIConfigState): AIConfigState => {
    const cloned = coerceAIConfig(config);
    return {
        ...cloned,
        providers: cloned.providers.map(provider => ({
            ...provider,
            apiKey: '',
            credentialState: provider.apiKey ? 'required' as const : provider.credentialState,
        }))
    };
};

export const setRuntimeAIConfig = (userId: string | null | undefined, config: AIConfigState): void => {
    if (!captureAuthSession(userId).isCurrent()) return;
    revision += 1;
    runtimeAIConfigs.set(getAIConfigKey(userId), coerceAIConfig(config));
};

export const clearRuntimeAIConfig = (userId?: string | null): void => {
    if (userId) {
        revision += 1;
        runtimeAIConfigs.delete(getAIConfigKey(userId));
    } else {
        invalidateAuthSessionWork();
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('aiConfigChanged'));
    }
};

export const persistAIConfig = (userId: string | null | undefined, config: AIConfigState): void => {
    if (!captureAuthSession(userId).isCurrent()) return;
    const normalized = coerceAIConfig(config);
    setRuntimeAIConfig(userId, normalized);
    const localConfig = { ...stripAIConfigSecrets(normalized), version: 3 };
    try {
        localStorage.setItem(getAIConfigKey(userId), JSON.stringify(localConfig));
    } catch (error) {
        logAIConfigStorageFailure('persistAIConfig', error);
    }
};

export const getAIConfig = (userId?: string | null): AIConfigState => {
    try {
        let keyToUse = getAIConfigKey(userId);
        if (userId === undefined) {
            if (typeof window !== 'undefined' && window.__currentUserId) {
                keyToUse = getAIConfigKey(window.__currentUserId);
            }
        }

        const runtimeConfig = runtimeAIConfigs.get(keyToUse);
        if (runtimeConfig) return cloneAIConfig(runtimeConfig);

        let parsed: unknown | null = null;
        try {
            parsed = parseStoredAIConfig(localStorage.getItem(keyToUse));
        } catch (error) {
            logAIConfigStorageFailure('getAIConfig.readScopedConfig', error);
        }
        if (parsed) {
            const normalized = readPersistedAIConfig(parsed);
            if (normalized.providers.length > 0) return normalized;
        }

        const legacyOwner = keyToUse.slice(AI_CONFIG_KEY.length);
        const legacy = parseStoredAIConfig(localStorage.getItem(LEGACY_CONFIG_KEY + legacyOwner));
        if (legacy) return readPersistedAIConfig(legacy);

        let v1: unknown | null = null;
        try {
            v1 = parseStoredAIConfig(localStorage.getItem('DiagramView.AIConfig'));
        } catch (error) {
            logAIConfigStorageFailure('getAIConfig.readLegacyConfig', error);
        }
        if (isRecord(v1)) {
            const providers = DEFAULT_PROVIDERS.map(provider => ({
                ...provider,
                models: provider.models.map(model => ({ ...model }))
            }));
            const gemini = providers.find(p => p.id === 'gemini');
            if (gemini) {
                if (typeof v1.baseUrl === 'string') gemini.baseUrl = v1.baseUrl;
                if (typeof v1.apiKey === 'string' && v1.apiKey) gemini.credentialState = 'legacy-unavailable';
            }
            return coerceAIConfig({
                activeModelKey: 'gemini:gemini-2.0-flash-exp',
                systemPrompt: DEFAULT_SYSTEM_PROMPT,
                providers
            });
        }
    } catch (error) {
        logAIConfigStorageFailure('getAIConfig', error);
    }

    return getDefaultAIConfig();
};

const readPersistedAIConfig = (value: unknown): AIConfigState => {
    const normalized = coerceAIConfig(value);
    return { ...normalized, providers: normalized.providers.map(provider => ({
        ...provider, apiKey: '',
        credentialState: provider.apiKey ? 'legacy-unavailable' : provider.credentialState,
    })) };
};

const loadStorageService = async () => (await import('@/services/SupabaseStorage')).storageService;

export const loadCloudAIConfig = async (userId: string): Promise<AIConfigState | null> => {
    const session = captureAuthSession(userId);
    const startedRevision = revision;
    if (!session.isCurrent()) return null;
    const storageService = await loadStorageService();
    if (!session.isCurrent()) return null;
    let cloudConfig = await storageService.loadConfig(AI_CLOUD_CONFIG_KEY, userId);
    if (!session.isCurrent() || revision !== startedRevision) return null;
    if (!cloudConfig) cloudConfig = await storageService.loadConfig('ai_config', userId);
    if (!session.isCurrent() || revision !== startedRevision || !isRecord(cloudConfig) || !Array.isArray(cloudConfig.providers)) return null;
    const normalized = readPersistedAIConfig(cloudConfig);
    const current = runtimeAIConfigs.get(getAIConfigKey(userId));
    return { ...normalized, providers: normalized.providers.map(provider => {
        const local = current?.providers.find(item => item.id === provider.id && item.baseUrl === provider.baseUrl);
        return local?.apiKey ? { ...provider, apiKey: local.apiKey, credentialState: 'ready' } : provider;
    }) };
};

export const saveCloudAIConfig = async (userId: string, config: AIConfigState): Promise<boolean> => {
    const session = captureAuthSession(userId);
    if (!session.isCurrent()) return false;
    const storageService = await loadStorageService();
    if (!session.isCurrent()) return false;
    await storageService.saveConfig(AI_CLOUD_CONFIG_KEY, { ...stripAIConfigSecrets(config), version: 3 }, userId);
    return session.isCurrent();
};
