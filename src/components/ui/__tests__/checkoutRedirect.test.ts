import { describe, expect, it } from 'vitest';
import { isSafeCheckoutRedirectUrl } from '../checkoutRedirect';

describe('checkoutRedirect', () => {
  it('allows Stripe hosted checkout URLs', () => {
    expect(isSafeCheckoutRedirectUrl(
      'https://checkout.stripe.com/c/pay/cs_test_123',
      'https://app.example.test'
    )).toBe(true);

    expect(isSafeCheckoutRedirectUrl(
      'https://buy.stripe.com/test_123',
      'https://app.example.test'
    )).toBe(true);
  });

  it('allows same-origin local development redirects', () => {
    expect(isSafeCheckoutRedirectUrl(
      'http://localhost:5173/?success=true',
      'http://localhost:5173'
    )).toBe(true);

    expect(isSafeCheckoutRedirectUrl(
      'http://127.0.0.1:5173/?success=true',
      'http://127.0.0.1:5173'
    )).toBe(true);
  });

  it('rejects unsafe checkout redirects', () => {
    expect(isSafeCheckoutRedirectUrl('javascript:alert(1)', 'https://app.example.test')).toBe(false);
    expect(isSafeCheckoutRedirectUrl('/local-path', 'https://app.example.test')).toBe(false);
    expect(isSafeCheckoutRedirectUrl('https://checkout.stripe.com.evil.test/pay', 'https://app.example.test')).toBe(false);
    expect(isSafeCheckoutRedirectUrl('https://app.example.test/?success=true', 'https://app.example.test')).toBe(false);
    expect(isSafeCheckoutRedirectUrl('http://checkout.stripe.com/pay', 'https://app.example.test')).toBe(false);
  });
});
