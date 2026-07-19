// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { CheckoutSessionError, createCheckoutSession } from '../checkoutSessionClient';

const options = {
  supabaseUrl: 'https://project.supabase.co',
  priceId: 'price_1234567890',
  jwtToken: 'header.payload.signature',
  origin: 'https://app.example.test',
};

describe('createCheckoutSession', () => {
  it('returns a validated Stripe redirect and sends bounded configuration', async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(createCheckoutSession({ ...options, fetchImplementation })).resolves.toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(fetchImplementation.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${options.jwtToken}`,
    });
  });

  it('rejects unsafe redirects, malformed sessions, and oversized responses', async () => {
    await expect(createCheckoutSession({
      ...options,
      fetchImplementation: async () => new Response(JSON.stringify({ url: 'javascript:alert(1)' })),
    })).rejects.toThrow('unsafe redirect');

    await expect(createCheckoutSession({ ...options, jwtToken: 'bad\r\ntoken' }))
      .rejects.toThrow('valid authenticated session');

    await expect(createCheckoutSession({
      ...options,
      fetchImplementation: async () => new Response('x'.repeat(70 * 1024)),
    })).rejects.toThrow('exceeded');
  });

  it('bounds and normalizes remote error messages', async () => {
    const remoteMessage = `remote\nAuthorization: Bearer checkout-secret ${'x'.repeat(1000)}`;
    await expect(createCheckoutSession({
      ...options,
      fetchImplementation: async () => new Response(JSON.stringify({ error: remoteMessage }), { status: 400 }),
    })).rejects.toMatchObject({
      name: 'CheckoutSessionError',
      status: 400,
    });

    try {
      await createCheckoutSession({
        ...options,
        fetchImplementation: async () => new Response(JSON.stringify({ error: remoteMessage }), { status: 400 }),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CheckoutSessionError);
      expect((error as Error).message.length).toBeLessThanOrEqual(500);
      expect((error as Error).message).not.toContain('\n');
      expect((error as Error).message).not.toContain('checkout-secret');
    }
  });
});
