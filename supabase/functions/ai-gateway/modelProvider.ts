import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { gatewayProviderFetch } from './providerFetch.ts';

export type GatewayProviderKind =
  | 'anthropic'
  | 'google'
  | 'openai'
  | 'openai-compatible'
  | 'openai-responses';

export interface GatewayModelProviderConfig {
  id?: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
  apiMode?: 'chat-completions' | 'responses';
}

export const resolveGatewayProviderKind = (
  providerId: unknown,
  baseURL: string,
  apiMode: unknown = 'chat-completions',
): GatewayProviderKind => {
  if (apiMode === 'responses') return 'openai-responses';
  const origin = new URL(baseURL).origin;
  if (providerId === 'anthropic' && origin === 'https://api.anthropic.com') return 'anthropic';
  if (providerId === 'gemini' && origin === 'https://generativelanguage.googleapis.com') return 'google';
  if (providerId === 'openai' && origin === 'https://api.openai.com') return 'openai';
  return 'openai-compatible';
};

const resolveGoogleBaseURL = (baseURL: string): string => (
  baseURL.endsWith('/openai') ? baseURL.slice(0, -'/openai'.length) : baseURL
);

export const createGatewayLanguageModel = (
  config: GatewayModelProviderConfig,
): LanguageModel => {
  const kind = resolveGatewayProviderKind(config.id, config.baseURL, config.apiMode);
  if (kind === 'openai-responses') {
    return createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      name: 'vizly-responses-compatible',
      fetch: gatewayProviderFetch,
    }).responses(config.modelId);
  }
  if (kind === 'anthropic') {
    return createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL, fetch: gatewayProviderFetch })(config.modelId);
  }
  if (kind === 'google') {
    return createGoogleGenerativeAI({
      apiKey: config.apiKey,
      baseURL: resolveGoogleBaseURL(config.baseURL),
      fetch: gatewayProviderFetch,
    })(config.modelId);
  }
  if (kind === 'openai') {
    return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, fetch: gatewayProviderFetch }).chat(config.modelId);
  }
  return createOpenAICompatible({
    name: 'vizly-compatible',
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    fetch: gatewayProviderFetch,
  })(config.modelId);
};
