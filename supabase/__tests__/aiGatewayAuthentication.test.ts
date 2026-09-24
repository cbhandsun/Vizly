import { describe, expect, it, vi } from 'vitest';
import { createAIGatewayUserAuthenticator } from '../functions/ai-gateway/userAuthentication';

const request = new Request('https://project.supabase.co/functions/v1/ai-gateway', {
  headers: { Authorization: 'Bearer header.payload.signature-token' },
});

describe('AI gateway user authentication', () => {
  it('accepts only a verified user identity', async () => {
    const verify = vi.fn().mockResolvedValue({
      data: { authMode: 'user', userClaims: { id: 'user-id' } },
      error: null,
    });

    await expect(createAIGatewayUserAuthenticator(verify)(request)).resolves.toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith(request, { auth: 'user' });
  });

  it.each([
    { data: { authMode: 'publishable', userClaims: null }, error: null },
    { data: { authMode: 'user', userClaims: null }, error: null },
    { data: { authMode: 'user', userClaims: { id: '' } }, error: null },
    { data: null, error: { status: 401 } },
  ])('rejects anonymous or malformed authentication results', async (outcome) => {
    const authenticate = createAIGatewayUserAuthenticator(
      vi.fn().mockResolvedValue(outcome),
    );

    await expect(authenticate(request)).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
  });

  it.each([
    { kind: 'service-error', verify: vi.fn().mockResolvedValue({ data: null, error: { status: 503 } }) },
    { kind: 'exception', verify: vi.fn().mockRejectedValue(new Error('network failure')) },
  ])('fails closed when verification is unavailable: $kind', async ({ verify }) => {
    await expect(createAIGatewayUserAuthenticator(verify)(request)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
