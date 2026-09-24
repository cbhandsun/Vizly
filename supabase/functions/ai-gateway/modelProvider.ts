import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export type GatewayProviderKind = 'anthropic' | 'google' | 'openai' | 'openai-compatible';

export interface GatewayModelProviderConfig {
  id?: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
}

export const resolveGatewayProviderKind = (
  providerId: unknown,
  baseURL: string,
): GatewayProviderKind => {
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
  const kind = resolveGatewayProviderKind(config.id, config.baseURL);
  if (kind === 'anthropic') {
    return createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL })(config.modelId);
  }
  if (kind === 'google') {
    return createGoogleGenerativeAI({
      apiKey: config.apiKey,
      baseURL: resolveGoogleBaseURL(config.baseURL),
    })(config.modelId);
  }
  if (kind === 'openai') {
    return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL }).chat(config.modelId);
  }
  return createOpenAICompatible({
    name: 'vizly-compatible',
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })(config.modelId);
};
