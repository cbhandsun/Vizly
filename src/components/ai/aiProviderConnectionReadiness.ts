import { normalizeProviderBaseUrl } from '@/services/ai/providerSecurity';

import type { AIProviderConfig } from './aiConfigStorage';

const LOCAL_PROVIDER_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export type AIProviderConnectionIssue =
    | 'missing-base-url'
    | 'invalid-base-url'
    | 'missing-api-key';

export type AIProviderAuthMode = 'bearer-required' | 'optional-local';

export type AIProviderConnectionReadiness =
    | {
        ready: true;
        issue: null;
        authMode: AIProviderAuthMode;
        normalizedBaseUrl: string;
    }
    | {
        ready: false;
        issue: AIProviderConnectionIssue;
        authMode: AIProviderAuthMode;
        normalizedBaseUrl: string | null;
    };

const resolveAuthMode = (normalizedBaseUrl: string | null): AIProviderAuthMode => {
    if (!normalizedBaseUrl) return 'bearer-required';

    try {
        return LOCAL_PROVIDER_HOSTS.has(new URL(normalizedBaseUrl).hostname)
            ? 'optional-local'
            : 'bearer-required';
    } catch {
        return 'bearer-required';
    }
};

export const getAIProviderConnectionReadiness = (
    provider: Pick<AIProviderConfig, 'baseUrl' | 'apiKey'>,
): AIProviderConnectionReadiness => {
    const rawBaseUrl = provider.baseUrl.trim();
    if (!rawBaseUrl) {
        return {
            ready: false,
            issue: 'missing-base-url',
            authMode: 'bearer-required',
            normalizedBaseUrl: null,
        };
    }

    const normalizedBaseUrl = normalizeProviderBaseUrl(rawBaseUrl);
    const authMode = resolveAuthMode(normalizedBaseUrl);
    if (!normalizedBaseUrl) {
        return {
            ready: false,
            issue: 'invalid-base-url',
            authMode,
            normalizedBaseUrl: null,
        };
    }

    if (authMode === 'bearer-required' && !provider.apiKey.trim()) {
        return {
            ready: false,
            issue: 'missing-api-key',
            authMode,
            normalizedBaseUrl,
        };
    }

    return {
        ready: true,
        issue: null,
        authMode,
        normalizedBaseUrl,
    };
};
