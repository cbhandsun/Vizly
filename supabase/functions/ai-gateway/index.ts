import { handleAIGatewayRequest } from './handler.ts';
import { authenticateAIGatewayUser } from './userAuthentication.ts';
import { createGatewayResourceStore } from './resourceStore.ts';

interface DenoRuntime {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
}

const denoRuntime = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;

if (!denoRuntime) {
  throw new Error('The AI gateway must run in a Deno-compatible Edge Function runtime.');
}

const resourceStore = createGatewayResourceStore(denoRuntime.env.get('SUPABASE_URL'),
  denoRuntime.env.get('SUPABASE_SERVICE_ROLE_KEY'));
// Provider warnings may contain arbitrary text/model identifiers. This isolate
// serves only the gateway; use the allowlisted usage record instead.
globalThis.AI_SDK_LOG_WARNINGS = false;
const edgeRuntime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(task: Promise<void>): void } }).EdgeRuntime;
denoRuntime.serve((request) => handleAIGatewayRequest(request, {
  allowedOrigins: denoRuntime.env.get('AI_GATEWAY_ALLOWED_ORIGINS'),
  allowedProviderOrigins: denoRuntime.env.get('AI_GATEWAY_ALLOWED_PROVIDER_ORIGINS'),
  maxOutputTokens: denoRuntime.env.get('AI_GATEWAY_MAX_OUTPUT_TOKENS'),
  authenticateUser: authenticateAIGatewayUser,
  resourceStore,
  recordUsage: record => { console.info(JSON.stringify(record)); },
  waitUntil: edgeRuntime ? task => edgeRuntime.waitUntil(task) : undefined,
}));
