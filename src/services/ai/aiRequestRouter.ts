import { supabase } from '@/services/supabase';
import { normalizeProviderBaseUrl } from './providerSecurity';
import {
    requestAIChatCompletion,
    type AIProviderRequestConfig,
    type AIProviderRequestOptions,
} from './aiProviderClient';
import {
    probeAIGateway,
    requestAIGatewayChatCompletion,
    type AIGatewayRequestOptions,
} from './aiGatewayClient';

export type AIGatewayMode = 'auto' | 'off' | 'required';

const POSITIVE_PROBE_TTL_MS = 5 * 60_000;
const NEGATIVE_PROBE_TTL_MS = 60_000;
let gatewayProbeCache: { available: boolean; expiresAt: number } | null = null;

export const coerceAIGatewayMode = (value: unknown): AIGatewayMode => (
    value === 'off' || value === 'required' ? value : 'auto'
);

export const isRemoteAIProvider = (baseUrl: string): boolean => {
    const normalized = normalizeProviderBaseUrl(baseUrl);
    return Boolean(normalized && new URL(normalized).protocol === 'https:');
};

interface AIRequestRouterDependencies {
    mode?: AIGatewayMode;
    supabaseUrl?: unknown;
    getAccessToken?: () => Promise<string | null>;
    probe?: (options: AIGatewayRequestOptions) => Promise<boolean>;
    gatewayRequest?: typeof requestAIGatewayChatCompletion;
    directRequest?: typeof requestAIChatCompletion;
    now?: () => number;
}

const defaultGetAccessToken = async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
};

const resolveGatewayAvailability = async (
    options: AIGatewayRequestOptions,
    probe: NonNullable<AIRequestRouterDependencies['probe']>,
    now: () => number,
): Promise<boolean> => {
    const timestamp = now();
    if (gatewayProbeCache && gatewayProbeCache.expiresAt > timestamp) {
        return gatewayProbeCache.available;
    }
    const available = await probe(options);
    gatewayProbeCache = {
        available,
        expiresAt: timestamp + (available ? POSITIVE_PROBE_TTL_MS : NEGATIVE_PROBE_TTL_MS),
    };
    return available;
};

export const clearAIGatewayProbeCache = (): void => {
    gatewayProbeCache = null;
};

export async function requestAIChatCompletionRouted(
    provider: AIProviderRequestConfig,
    body: unknown,
    options: AIProviderRequestOptions = {},
    dependencies: AIRequestRouterDependencies = {},
): Promise<Response> {
    const directRequest = dependencies.directRequest ?? requestAIChatCompletion;
    const mode = dependencies.mode
        ?? coerceAIGatewayMode(import.meta.env.VITE_AI_GATEWAY_MODE);
    if (mode === 'off' || !isRemoteAIProvider(provider.baseUrl)) {
        return directRequest(provider, body, options);
    }

    const getAccessToken = dependencies.getAccessToken ?? defaultGetAccessToken;
    const jwtToken = await getAccessToken();
    const supabaseUrl = dependencies.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
    if (!jwtToken || !supabaseUrl) {
        if (mode === 'required') {
            throw new Error('AI Gateway 模式要求先登录并配置 Supabase。');
        }
        return directRequest(provider, body, options);
    }

    const gatewayOptions: AIGatewayRequestOptions = {
        ...options,
        supabaseUrl,
        jwtToken,
    };
    if (mode === 'auto') {
        const available = await resolveGatewayAvailability(
            { ...gatewayOptions, timeoutMs: 5_000 },
            dependencies.probe ?? probeAIGateway,
            dependencies.now ?? Date.now,
        );
        if (!available) return directRequest(provider, body, options);
    }

    return (dependencies.gatewayRequest ?? requestAIGatewayChatCompletion)(
        provider,
        body,
        gatewayOptions,
    );
}
