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
import { BodyLimitError, readBoundedBody } from '../_shared/boundedBody.ts';
import { parseGatewayOutputTokenLimit } from './resourcePolicy.ts';
import type { GatewayResourceStore, GatewayAdmission } from './resourceStore.ts';
import { createGatewayUsageRecorder, type GatewayUsageRecord } from './usageRecord.ts';

export interface AIGatewayEnvironment {
  allowedOrigins?: string;
  allowedProviderOrigins?: string;
  maxOutputTokens?: string;
  authenticateUser: AIGatewayUserAuthenticator;
  resourceStore?: GatewayResourceStore;
  waitUntil?: (task: Promise<void>) => void;
  recordUsage?: (record: Readonly<GatewayUsageRecord>) => void | Promise<void>;
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
  let rawBody: string;
  try {
    rawBody = await readBoundedBody(
      request.body,
      AI_GATEWAY_MAX_BODY_CHARS,
      AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    );
  } catch (error) {
    if (error instanceof BodyLimitError) return jsonResponse(413, 'Request body is too large.', corsHeaders);
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return jsonResponse(408, 'Request body could not be read in time.', corsHeaders);
    }
    return jsonResponse(400, 'Invalid request body.', corsHeaders);
  }
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

  const streamCancellation = new AbortController();
  const usage = createGatewayUsageRecorder(authentication.userId, environment.recordUsage, environment.waitUntil);
  let maxOutputTokens: number;
  try { maxOutputTokens = parseGatewayOutputTokenLimit(environment.maxOutputTokens); }
  catch { usage.finish('unavailable'); return jsonResponse(503, 'AI gateway resource configuration is unavailable.', corsHeaders); }
  let admission: GatewayAdmission;
  try {
    if (!environment.resourceStore) throw new Error('Resource store not configured');
    admission = await environment.resourceStore.acquire(authentication.userId, request.signal);
  } catch { usage.finish('unavailable'); return jsonResponse(503, 'AI gateway resource service is unavailable.', corsHeaders); }
  if (!admission.admitted) {
    usage.finish('limited');
    const headers = new Headers(corsHeaders);
    headers.set('Retry-After', String(admission.retryAfterSeconds));
    return jsonResponse(429, 'AI request limit reached. Retry later.', headers);
  }
  let released = false;
  const lease = admission;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    request.signal.removeEventListener('abort', cancel);
    // Failed cleanup remains bounded by the database's 150-second lease TTL.
    const task = Promise.resolve().then(() => lease.release()).catch(() => undefined);
    try { environment.waitUntil?.(task); } catch { /* The task is still observed. */ }
  };
  const cancel = () => { usage.finish('cancelled'); streamCancellation.abort(); release(); };
  const timer = setTimeout(() => { usage.finish('timeout'); cancel(); }, 120_000);
  request.signal.addEventListener('abort', cancel, { once: true });
  if (request.signal.aborted) { cancel(); return jsonResponse(408, 'AI request was cancelled.', corsHeaders); }
  try {
    const instructions = parsed.value.messages
      .filter(message => message.role === 'system')
      .map(message => ({ role: 'system' as const, content: message.content }));
    if (instructions.length > 0 && parsed.value.toolMode === 'diagram') {
      instructions[0].content += '\n\n当平台提供图表工具时，原子化画布操作必须调用对应工具，不要输出 [COMMAND: ...] 文本；完整图表生成仍可返回 JSON。';
    }
    const result = streamText({
      model: createGatewayLanguageModel({
        id: parsed.value.provider.id,
        apiKey: parsed.value.provider.apiKey,
        baseURL: baseUrlResult.baseURL,
        modelId: parsed.value.model,
        apiMode: parsed.value.provider.apiMode,
      }),
      instructions: instructions.length > 0 ? instructions : undefined,
      messages: parsed.value.messages.flatMap(({ role, content }) => (
        role === 'system' ? [] : [{ role, content }]
      )),
      tools: parsed.value.toolMode === 'diagram' ? diagramTools : undefined,
      maxOutputTokens,
      // The SDK default prints raw provider errors, which can include request
      // bodies and credentials. The bounded stream emits sanitized outcomes.
      onError: () => {},
      abortSignal: AbortSignal.any([request.signal, streamCancellation.signal]),
      timeout: { totalMs: 120_000, firstChunkMs: 30_000, chunkMs: 30_000 },
    });
    return createGatewayStreamResponse(result.stream, corsHeaders, cancel, release, usage);
  } catch {
    usage.finish('failed');
    cancel();
    return jsonResponse(502, 'AI generation is unavailable.', corsHeaders);
  }
};
