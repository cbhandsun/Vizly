const STRIPE_CHECKOUT_HOSTS = new Set(['checkout.stripe.com', 'buy.stripe.com']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const isSafeCheckoutRedirectUrl = (
  value: unknown,
  currentOrigin: string,
): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 4096) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' && STRIPE_CHECKOUT_HOSTS.has(parsed.hostname)) return true;

    const current = new URL(currentOrigin);
    const sameOrigin = parsed.origin === current.origin;
    const localHttp = parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname);
    return sameOrigin && localHttp;
  } catch {
    return false;
  }
};
