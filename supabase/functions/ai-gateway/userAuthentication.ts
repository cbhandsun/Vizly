import { verifyAuth } from '@supabase/server/core';

export type AIGatewayAuthenticationResult =
  | { ok: true }
  | { ok: false; reason: 'unauthorized' | 'unavailable' };

export type AIGatewayUserAuthenticator = (
  request: Request,
) => Promise<AIGatewayAuthenticationResult>;

interface VerifyAuthOutcome {
  data: {
    authMode: string;
    userClaims: { id?: unknown } | null;
  } | null;
  error: { status?: number } | null;
}

type VerifyUserAuth = (
  request: Request,
  options: { auth: 'user' },
) => Promise<VerifyAuthOutcome>;

const supabaseVerifyUserAuth: VerifyUserAuth = verifyAuth;

export const createAIGatewayUserAuthenticator = (
  verifyUserAuth: VerifyUserAuth = supabaseVerifyUserAuth,
): AIGatewayUserAuthenticator => async (request) => {
  try {
    const { data, error } = await verifyUserAuth(request, { auth: 'user' });
    if (error) {
      return {
        ok: false,
        reason: typeof error.status === 'number' && error.status >= 500
          ? 'unavailable'
          : 'unauthorized',
      };
    }
    if (data?.authMode !== 'user'
      || typeof data.userClaims?.id !== 'string'
      || !data.userClaims.id) {
      return { ok: false, reason: 'unauthorized' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
};

export const authenticateAIGatewayUser = createAIGatewayUserAuthenticator();
