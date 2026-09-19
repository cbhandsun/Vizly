import { streamText } from 'ai';
import { diagramTools } from './diagramTools.ts';
import { createGatewayLanguageModel } from './modelProvider.ts';
import { validateGatewayProviderBaseUrl } from './providerPolicy.ts';
import {
  AI_GATEWAY_MAX_BODY_CHARS,
  parseAIGatewayRequest,
} from './requestBoundary.ts';
import {
  buildGatewayCorsHeaders,
  hasBearerAuthorization,
  isAllowedGatewayRequestOrigin,
} from './requestPolicy.ts';
import { createGatewayStreamResponse } from './streamResponse.ts';
import type { AIGatewayUserAuthenticator } from './userAuthentication.ts';

export interface AIGatewayEnvironment {
  allowedOrigins?: string;
  allowedProviderOrigins?: string;
  authenticateUser: AIGatewayUserAuthenticator;
}

const jsonResponse = (
  status: number,
  error: string,
  headers: Headers,
): Response => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('X-Vizly-AI-Gateway', 'vizly-ai-gateway-v1');
  return new Response(JSON.stringify({ error }), { status, headers: responseHeaders });
};

export const handleAIGatewayRequest = async (
  request: Request,
  environment: AIGatewayEnvironment,
): Promise<Response> => {
  const requestOrigin = request.headers.get('Origin');
  const corsHeaders = buildGatewayCorsHeaders(requestOrigin);
  if (!isAllowedGatewayRequestOrigin(requestOrigin, environment.allowedOrigins)) {
    return jsonResponse(403, 'Request origin is not allowed.', corsHeaders);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!hasBearerAuthorization(request.headers.get('Authorization'))) {
    return jsonResponse(401, 'Authentication is required.', corsHeaders);
  }
  const authentication = await environment.authenticateUser(request);
  if (!authentication.ok) {
    return jsonResponse(
      authentication.reason === 'unavailable' ? 503 : 401,
      authentication.reason === 'unavailable'
        ? 'Authentication service is unavailable.'
        : 'Authentication is required.',
      corsHeaders,
    );
  }
  if (request.method === 'GET' && new URL(request.url).searchParams.get('health') === '1') {
    return jsonResponse(200, 'ok', corsHeaders);
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, 'Method not allowed.', corsHeaders);
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (Number.isFinite(contentLength) && contentLength > AI_GATEWAY_MAX_BODY_CHARS) {
    return jsonResponse(413, 'Request body is too large.', corsHeaders);
  }
  const rawBody = await request.text();
  const parsed = parseAIGatewayRequest(rawBody);
  if (!parsed.ok) {
    const status = parsed.reason === 'body-too-large' ? 413 : 400;
    return jsonResponse(status, 'Invalid AI gateway request.', corsHeaders);
  }

  const baseUrlResult = validateGatewayProviderBaseUrl(
    parsed.value.provider.baseUrl,
    environment.allowedProviderOrigins,
  );
  if (!baseUrlResult.ok) {
    return jsonResponse(
      baseUrlResult.reason === 'origin-not-allowed' ? 403 : 400,
      baseUrlResult.reason === 'origin-not-allowed'
        ? 'Provider origin is not allowed by the AI gateway.'
        : 'Provider Base URL is invalid.',
      corsHeaders,
    );
  }

  const result = streamText({
    model: createGatewayLanguageModel({
      id: parsed.value.provider.id,
      apiKey: parsed.value.provider.apiKey,
      baseURL: baseUrlResult.baseURL,
      modelId: parsed.value.model,
    }),
    messages: parsed.value.messages.map((message, index) => (
      index === 0 && message.role === 'system' && parsed.value.toolMode === 'diagram'
        ? {
          ...message,
          content: `${message.content}\n\n当平台提供图表工具时，原子化画布操作必须调用对应工具，不要输出 [COMMAND: ...] 文本；完整图表生成仍可返回 JSON。`,
        }
        : message
    )),
    tools: parsed.value.toolMode === 'diagram' ? diagramTools : undefined,
    abortSignal: request.signal,
    timeout: { totalMs: 120_000, firstChunkMs: 30_000, chunkMs: 30_000 },
  });
  return createGatewayStreamResponse(result.stream, corsHeaders);
};
