import { handleAIGatewayRequest } from './handler.ts';
import { authenticateAIGatewayUser } from './userAuthentication.ts';

interface DenoRuntime {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
}

const denoRuntime = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;

if (!denoRuntime) {
  throw new Error('The AI gateway must run in a Deno-compatible Edge Function runtime.');
}

denoRuntime.serve((request) => handleAIGatewayRequest(request, {
  allowedOrigins: denoRuntime.env.get('AI_GATEWAY_ALLOWED_ORIGINS'),
  allowedProviderOrigins: denoRuntime.env.get('AI_GATEWAY_ALLOWED_PROVIDER_ORIGINS'),
  authenticateUser: authenticateAIGatewayUser,
}));
