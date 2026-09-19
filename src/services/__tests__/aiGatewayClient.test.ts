import { describe, expect, it, vi } from 'vitest';
import {
  probeAIGateway,
  requestAIGatewayChatCompletion,
} from '../ai/aiGatewayClient';
import { AIProviderInvalidRequestError } from '../ai/aiProviderClient';

const provider = {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'provider-secret-placeholder',
};

const gatewayOptions = {
  supabaseUrl: 'https://project.supabase.co',
  jwtToken: 'header.payload.signature-token',
  timeoutMs: 10_000,
};

describe('aiGatewayClient', () => {
  it('probes the authenticated gateway without sending provider credentials', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'X-Vizly-AI-Gateway': 'vizly-ai-gateway-v1' },
    }));

    await expect(probeAIGateway({ ...gatewayOptions, fetchImplementation })).resolves.toBe(true);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/ai-gateway?health=1',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: `Bearer ${gatewayOptions.jwtToken}` },
      }),
    );
    expect(JSON.stringify(fetchImplementation.mock.calls)).not.toContain(provider.apiKey);
  });

  it('sends a bounded gateway request and keeps the provider key out of headers', async () => {
    const response = new Response('data: [DONE]\n\n', { status: 200 });
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await expect(requestAIGatewayChatCompletion(provider, {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
    }, { ...gatewayOptions, fetchImplementation })).resolves.toBe(response);

    const init = fetchImplementation.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${gatewayOptions.jwtToken}`,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      provider,
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
      toolMode: 'diagram',
    });
  });

  it('rejects malformed sessions and chat bodies before fetch', async () => {
    const fetchImplementation = vi.fn();
    await expect(requestAIGatewayChatCompletion(provider, {}, {
      ...gatewayOptions,
      fetchImplementation,
    })).rejects.toBeInstanceOf(AIProviderInvalidRequestError);
    await expect(requestAIGatewayChatCompletion(provider, {
      model: 'deepseek-chat',
      messages: [],
    }, {
      ...gatewayOptions,
      jwtToken: 'bad\r\ntoken',
      fetchImplementation,
    })).rejects.toBeInstanceOf(AIProviderInvalidRequestError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
