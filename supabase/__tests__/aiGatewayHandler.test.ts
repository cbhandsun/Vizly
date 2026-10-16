import { describe, expect, it } from 'vitest';
import { handleAIGatewayRequest } from '../functions/ai-gateway/handler';
import { AI_GATEWAY_MAX_BODY_CHARS } from '../functions/ai-gateway/requestBoundary';

const PROVIDER_KEY_CANARY = ['provider', 'key', 'canary'].join('-');
const JWT_CANARY = ['header', 'payload', 'signature'].join('.');

const authHeaders = {
  Authorization: `Bearer ${JWT_CANARY}`,
  Origin: 'http://127.0.0.1:4173',
};

const authenticatedEnvironment = {
  authenticateUser: async () => ({ ok: true as const }),
};

describe('AI gateway handler', () => {
  it('rejects an oversized streamed UTF-8 body without Content-Length and cancels the reader', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('图'.repeat(Math.ceil(AI_GATEWAY_MAX_BODY_CHARS / 3) + 1)));
      },
      cancel() { cancelled = true; },
    });
    const request = new Request('https://project.supabase.co/functions/v1/ai-gateway', {
      method: 'POST', headers: authHeaders, body,
      ...{ duplex: 'half' },
    });
    const response = await handleAIGatewayRequest(request, authenticatedEnvironment);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    await expect(response.json()).resolves.toEqual({ error: 'Request body is too large.' });
  });

  it('exposes an authenticated capability probe with protocol identity', async () => {
    const response = await handleAIGatewayRequest(new Request(
      'https://project.supabase.co/functions/v1/ai-gateway?health=1',
      { headers: authHeaders },
    ), authenticatedEnvironment);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Vizly-AI-Gateway')).toBe('vizly-ai-gateway-v1');
    await expect(response.json()).resolves.toEqual({ error: 'ok' });
  });

  it('rejects missing authentication and unconfigured production origins', async () => {
    const unauthenticated = await handleAIGatewayRequest(new Request(
      'https://project.supabase.co/functions/v1/ai-gateway?health=1',
      { headers: { Origin: 'http://127.0.0.1:4173' } },
    ), authenticatedEnvironment);
    expect(unauthenticated.status).toBe(401);

    const untrustedOrigin = await handleAIGatewayRequest(new Request(
      'https://project.supabase.co/functions/v1/ai-gateway?health=1',
      {
        headers: {
          Authorization: authHeaders.Authorization,
          Origin: 'https://untrusted.example.com',
        },
      },
    ), {
      ...authenticatedEnvironment,
      allowedOrigins: 'https://vizly.example.com',
    });
    expect(untrustedOrigin.status).toBe(403);
  });

  it('rejects a bearer credential that is not an authenticated user session', async () => {
    const response = await handleAIGatewayRequest(new Request(
      'https://project.supabase.co/functions/v1/ai-gateway?health=1',
      { headers: authHeaders },
    ), {
      authenticateUser: async () => ({ ok: false, reason: 'unauthorized' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication is required.' });
  });

  it('fails closed when user authentication is unavailable', async () => {
    const response = await handleAIGatewayRequest(new Request(
      'https://project.supabase.co/functions/v1/ai-gateway?health=1',
      { headers: authHeaders },
    ), {
      authenticateUser: async () => ({ ok: false, reason: 'unavailable' }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication service is unavailable.',
    });
  });

  it('rejects provider origins outside the server allowlist before model invocation', async () => {
    const response = await handleAIGatewayRequest(new Request(
      'https://project.supabase.co/functions/v1/ai-gateway',
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: {
            id: 'custom',
            baseUrl: 'https://private.example.com/v1',
            apiKey: PROVIDER_KEY_CANARY,
          },
          model: 'model-1',
          messages: [{ role: 'user', content: 'hello' }],
          toolMode: 'diagram',
        }),
      },
    ), authenticatedEnvironment);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Provider origin is not allowed by the AI gateway.',
    });
  });
});
