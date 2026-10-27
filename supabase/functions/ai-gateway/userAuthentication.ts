import { verifyAuth } from '@supabase/server/core';

export type AIGatewayAuthenticationResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unauthorized' | 'unavailable' };

export type AIGatewayUserAuthenticator = (
  request: Request,
) => Promise<AIGatewayAuthenticationResult>;

interface VerifyAuthOutcome {
  data: {
    authMode: string;
    userClaims: { id?: unknown } | null;
    jwtClaims?: Record<string, unknown> | null;
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
      || !/^[A-Za-z0-9_-]{1,128}$/.test(data.userClaims.id)
      || data.jwtClaims?.is_anonymous === true) {
      return { ok: false, reason: 'unauthorized' };
    }
    return { ok: true, userId: data.userClaims.id };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
};

export const authenticateAIGatewayUser = createAIGatewayUserAuthenticator();
