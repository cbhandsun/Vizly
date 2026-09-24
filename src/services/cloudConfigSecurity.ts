const MAX_CONFIG_JSON_CHARS = 512 * 1024;
const MAX_OBJECT_KEYS = 200;
const MAX_ARRAY_ITEMS = 500;
const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 20_000;
const MAX_AI_PROVIDERS = 20;
const MAX_AI_MODELS = 200;
const MAX_ID_LENGTH = 160;
const MAX_SECRET_LENGTH = 8_000;
const SAFE_CONFIG_KEYS = new Set(['ai_config', 'layered-config-global', 'layered-config-user']);
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface CloudConfigRow {
    key: string;
    value: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

export const normalizeCloudConfigKey = (key: unknown): string | null => {
    if (typeof key !== 'string') return null;
    const trimmed = key.trim();
    return SAFE_CONFIG_KEYS.has(trimmed) ? trimmed : null;
};

const sanitizeJsonValue = (value: unknown, depth = 0): unknown => {
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);

    if (Array.isArray(value)) {
        if (depth >= MAX_DEPTH) return [];
        return value
            .slice(0, MAX_ARRAY_ITEMS)
            .map(item => sanitizeJsonValue(item, depth + 1))
            .filter(item => item !== undefined);
    }

    if (isRecord(value)) {
        if (depth >= MAX_DEPTH) return {};
        const out: Record<string, unknown> = {};
        for (const [nestedKey, nestedValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
            if (!nestedKey || nestedKey.length > MAX_ID_LENGTH || BLOCKED_KEYS.has(nestedKey)) continue;
            const sanitized = sanitizeJsonValue(nestedValue, depth + 1);
            if (sanitized !== undefined) out[nestedKey] = sanitized;
        }
        return out;
    }

    return undefined;
};

const enforceConfigSize = (value: unknown): void => {
    if (JSON.stringify(value).length > MAX_CONFIG_JSON_CHARS) {
        throw new Error('Cloud config is too large');
    }
};

const coerceAIConfigForCloud = (value: unknown): Record<string, unknown> => {
    if (!isRecord(value)) throw new Error('ai_config must be an object');

    const sanitized = sanitizeJsonValue(value);
    if (!isRecord(sanitized)) throw new Error('ai_config must be an object');

    const providers = Array.isArray(sanitized.providers) ? sanitized.providers.slice(0, MAX_AI_PROVIDERS) : [];
    if (providers.length === 0) throw new Error('ai_config providers must be an array');

    return {
        activeModelKey: typeof sanitized.activeModelKey === 'string'
            ? sanitized.activeModelKey.slice(0, MAX_ID_LENGTH * 2 + 1)
            : '',
        systemPrompt: typeof sanitized.systemPrompt === 'string'
            ? sanitized.systemPrompt.slice(0, MAX_STRING_LENGTH)
            : '',
        providers: providers
            .map((provider, providerIndex) => {
                if (!isRecord(provider)) return null;
                const models = Array.isArray(provider.models) ? provider.models.slice(0, MAX_AI_MODELS) : [];
                return {
                    id: typeof provider.id === 'string' ? provider.id.slice(0, MAX_ID_LENGTH) : `provider-${providerIndex}`,
                    name: typeof provider.name === 'string' ? provider.name.slice(0, MAX_ID_LENGTH) : `provider-${providerIndex}`,
                    enabled: provider.enabled === true,
                    baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl.slice(0, 2_048) : '',
                    apiKey: typeof provider.apiKey === 'string' ? provider.apiKey.slice(0, MAX_SECRET_LENGTH) : '',
                    ...(typeof provider.icon === 'string' ? { icon: provider.icon.slice(0, MAX_ID_LENGTH) } : {}),
                    models: models
                        .map((model, modelIndex) => {
                            if (!isRecord(model)) return null;
                            const id = typeof model.id === 'string' ? model.id.slice(0, MAX_ID_LENGTH) : `model-${modelIndex}`;
                            return {
                                id,
                                name: typeof model.name === 'string' ? model.name.slice(0, MAX_ID_LENGTH) : id,
                                ...(typeof model.group === 'string' ? { group: model.group.slice(0, MAX_ID_LENGTH) } : {}),
                                enabled: model.enabled !== false,
                                ...(model.isCustom === true ? { isCustom: true } : {}),
                            };
                        })
                        .filter(Boolean),
                };
            })
            .filter(Boolean),
    };
};

export const coerceCloudConfigValue = (key: string, value: unknown): unknown => {
    const normalizedKey = normalizeCloudConfigKey(key);
    if (!normalizedKey) throw new Error('Unsupported cloud config key');

    const normalized = normalizedKey === 'ai_config'
        ? coerceAIConfigForCloud(value)
        : sanitizeJsonValue(value);

    enforceConfigSize(normalized);
    return normalized;
};

export const coerceCloudConfigRows = (rows: unknown): CloudConfigRow[] => {
    if (!Array.isArray(rows)) return [];
    const out: CloudConfigRow[] = [];

    for (const row of rows.slice(0, 100)) {
        if (!isRecord(row)) continue;
        const key = normalizeCloudConfigKey(row.key);
        if (!key) continue;
        try {
            out.push({ key, value: coerceCloudConfigValue(key, row.value) });
        } catch {
            continue;
        }
    }

    return out;
};
