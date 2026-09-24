import { describe, expect, it } from 'vitest';
import { validateGatewayProviderBaseUrl } from '../functions/ai-gateway/providerPolicy';
import { resolveGatewayProviderKind } from '../functions/ai-gateway/modelProvider';
import { parseAIGatewayRequest } from '../functions/ai-gateway/requestBoundary';
import {
  buildGatewayCorsHeaders,
  hasBearerAuthorization,
  isAllowedGatewayRequestOrigin,
} from '../functions/ai-gateway/requestPolicy';

const validRequest = {
  provider: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'provider-key-placeholder',
  },
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: 'hello' }],
  toolMode: 'diagram',
};

describe('AI gateway boundaries', () => {
  it('parses a bounded valid request', () => {
    const result = parseAIGatewayRequest(JSON.stringify(validRequest));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.model).toBe('deepseek-chat');
  });

  it('rejects malformed, oversized, empty, and unexpected inputs', () => {
    expect(parseAIGatewayRequest('{broken')).toEqual({ ok: false, reason: 'invalid-json' });
    expect(parseAIGatewayRequest('x'.repeat(2 * 1024 * 1024 + 1))).toEqual({
      ok: false,
      reason: 'body-too-large',
    });
    expect(parseAIGatewayRequest(JSON.stringify({
      ...validRequest,
      messages: [],
    }))).toEqual({ ok: false, reason: 'invalid-request' });
    expect(parseAIGatewayRequest(JSON.stringify({
      ...validRequest,
      extra: true,
    }))).toEqual({ ok: false, reason: 'invalid-request' });
  });

  it('allows only HTTPS provider origins from the server allowlist', () => {
    expect(validateGatewayProviderBaseUrl('https://api.deepseek.com/v1/', '')).toEqual({
      ok: true,
      baseURL: 'https://api.deepseek.com/v1',
    });
    expect(validateGatewayProviderBaseUrl('https://models.example.com/v1', 'https://models.example.com'))
      .toEqual({ ok: true, baseURL: 'https://models.example.com/v1' });
    expect(validateGatewayProviderBaseUrl('https://127.0.0.1/v1', ''))
      .toEqual({ ok: false, reason: 'origin-not-allowed' });
    expect(validateGatewayProviderBaseUrl('http://localhost:11434/v1', ''))
      .toEqual({ ok: false, reason: 'invalid-url' });
    expect(validateGatewayProviderBaseUrl('https://user:pass@api.openai.com/v1', ''))
      .toEqual({ ok: false, reason: 'invalid-url' });
  });

  it('selects native providers only for matching official origins', () => {
    expect(resolveGatewayProviderKind('anthropic', 'https://api.anthropic.com/v1')).toBe('anthropic');
    expect(resolveGatewayProviderKind('gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'))
      .toBe('google');
    expect(resolveGatewayProviderKind('openai', 'https://api.openai.com/v1')).toBe('openai');
    expect(resolveGatewayProviderKind('openai', 'https://proxy.example.com/v1'))
      .toBe('openai-compatible');
    expect(resolveGatewayProviderKind('custom', 'https://api.openai.com/v1'))
      .toBe('openai-compatible');
  });

  it('restricts browser origins while allowing local development', () => {
    expect(isAllowedGatewayRequestOrigin('http://127.0.0.1:4173', '')).toBe(true);
    expect(isAllowedGatewayRequestOrigin('https://vizly.example.com', 'https://vizly.example.com')).toBe(true);
    expect(isAllowedGatewayRequestOrigin('https://evil.example.com', 'https://vizly.example.com')).toBe(false);
    expect(isAllowedGatewayRequestOrigin(undefined, '')).toBe(true);
  });

  it('exposes the gateway protocol header to cross-origin browser clients', () => {
    const headers = buildGatewayCorsHeaders('https://vizly.example.com');

    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://vizly.example.com');
    expect(headers.get('Access-Control-Expose-Headers')).toBe('X-Vizly-AI-Gateway');
    expect(headers.get('Vary')).toBe('Origin');
  });

  it('accepts only bounded bearer authorization values', () => {
    expect(hasBearerAuthorization('Bearer header.payload.signature-token')).toBe(true);
    expect(hasBearerAuthorization('Basic abc')).toBe(false);
    expect(hasBearerAuthorization('Bearer bad\r\ntoken')).toBe(false);
  });
});
