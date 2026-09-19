import { z } from 'zod';

export const AI_GATEWAY_MAX_BODY_CHARS = 2 * 1024 * 1024;

const safeId = /^[A-Za-z0-9_.:/@+-]+$/;
const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(200_000),
}).strict();

const gatewayRequestSchema = z.object({
  provider: z.object({
    id: z.string().trim().min(1).max(160).regex(safeId).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    baseUrl: z.string().trim().min(1).max(2_048),
    apiKey: z.string().min(1).max(8_000),
  }).strict(),
  model: z.string().trim().min(1).max(160).regex(safeId),
  messages: z.array(messageSchema).min(1).max(80),
  toolMode: z.literal('diagram').optional(),
}).strict();

export type AIGatewayRequest = z.infer<typeof gatewayRequestSchema>;

export type AIGatewayRequestParseResult =
  | { ok: true; value: AIGatewayRequest }
  | { ok: false; reason: 'body-too-large' | 'invalid-json' | 'invalid-request' };

export const parseAIGatewayRequest = (rawBody: string): AIGatewayRequestParseResult => {
  if (rawBody.length > AI_GATEWAY_MAX_BODY_CHARS) {
    return { ok: false, reason: 'body-too-large' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  const result = gatewayRequestSchema.safeParse(parsed);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, reason: 'invalid-request' };
};
