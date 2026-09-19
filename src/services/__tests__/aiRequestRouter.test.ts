import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAIGatewayProbeCache,
  coerceAIGatewayMode,
  isRemoteAIProvider,
  requestAIChatCompletionRouted,
} from '../ai/aiRequestRouter';

const body = { model: 'model-1', messages: [{ role: 'user', content: 'hello' }] };
const remoteProvider = {
  id: 'custom',
  name: 'Remote',
  baseUrl: 'https://models.example.com/v1',
  apiKey: 'provider-key',
};

describe('aiRequestRouter', () => {
  beforeEach(() => clearAIGatewayProbeCache());

  it('coerces modes and distinguishes local from remote providers', () => {
    expect(coerceAIGatewayMode('required')).toBe('required');
    expect(coerceAIGatewayMode('off')).toBe('off');
    expect(coerceAIGatewayMode('unexpected')).toBe('auto');
    expect(isRemoteAIProvider('https://api.openai.com/v1')).toBe(true);
    expect(isRemoteAIProvider('http://localhost:11434/v1')).toBe(false);
    expect(isRemoteAIProvider('file:///tmp/model')).toBe(false);
  });

  it('keeps local and unauthenticated requests on direct transport', async () => {
    const directResponse = new Response('direct');
    const directRequest = vi.fn().mockResolvedValue(directResponse);
    const gatewayRequest = vi.fn();

    await expect(requestAIChatCompletionRouted({
      ...remoteProvider,
      baseUrl: 'http://localhost:11434/v1',
    }, body, {}, {
      mode: 'auto',
      directRequest,
      gatewayRequest,
    })).resolves.toBe(directResponse);

    await expect(requestAIChatCompletionRouted(remoteProvider, body, {}, {
      mode: 'auto',
      supabaseUrl: 'https://project.supabase.co',
      getAccessToken: async () => null,
      directRequest,
      gatewayRequest,
    })).resolves.toBe(directResponse);
    expect(gatewayRequest).not.toHaveBeenCalled();
  });

  it('uses the gateway only after a successful capability probe', async () => {
    const directRequest = vi.fn().mockResolvedValue(new Response('direct'));
    const gatewayResponse = new Response('gateway');
    const gatewayRequest = vi.fn().mockResolvedValue(gatewayResponse);
    const probe = vi.fn().mockResolvedValue(true);

    await expect(requestAIChatCompletionRouted(remoteProvider, body, { timeoutMs: 90_000 }, {
      mode: 'auto',
      supabaseUrl: 'https://project.supabase.co',
      getAccessToken: async () => 'header.payload.signature-token',
      directRequest,
      gatewayRequest,
      probe,
    })).resolves.toBe(gatewayResponse);

    expect(probe).toHaveBeenCalledOnce();
    expect(gatewayRequest).toHaveBeenCalledOnce();
    expect(directRequest).not.toHaveBeenCalled();
  });

  it('falls back before sending credentials when the optional gateway is absent', async () => {
    const directResponse = new Response('direct');
    const directRequest = vi.fn().mockResolvedValue(directResponse);
    const gatewayRequest = vi.fn();

    await expect(requestAIChatCompletionRouted(remoteProvider, body, {}, {
      mode: 'auto',
      supabaseUrl: 'https://project.supabase.co',
      getAccessToken: async () => 'header.payload.signature-token',
      directRequest,
      gatewayRequest,
      probe: async () => false,
    })).resolves.toBe(directResponse);
    expect(gatewayRequest).not.toHaveBeenCalled();
  });

  it('fails closed when gateway mode is required without a session', async () => {
    await expect(requestAIChatCompletionRouted(remoteProvider, body, {}, {
      mode: 'required',
      supabaseUrl: 'https://project.supabase.co',
      getAccessToken: async () => null,
      directRequest: vi.fn(),
    })).rejects.toThrow('要求先登录');
  });
});
