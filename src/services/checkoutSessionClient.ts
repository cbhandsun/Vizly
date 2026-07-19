import {
  fetchWithTimeout,
  readResponseJsonWithLimit,
  readResponseTextWithLimit,
  ResponseTooLargeError,
} from '@/core/utils/boundedResponse';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { buildSupabaseFunctionUrl, normalizeStripePriceId } from './runtimeEnv';
import { isSafeCheckoutRedirectUrl } from './checkoutSecurity';

const CHECKOUT_TIMEOUT_MS = 20_000;
const MAX_CHECKOUT_RESPONSE_CHARS = 64 * 1024;
const MAX_CHECKOUT_ERROR_CHARS = 16 * 1024;
const MAX_DISPLAY_ERROR_CHARS = 500;
const MAX_JWT_CHARS = 16 * 1024;

export class CheckoutSessionError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'CheckoutSessionError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const coerceDisplayError = (value: unknown, fallback: string): string => {
  const redacted = redactSensitiveLogValue(value);
  if (typeof redacted !== 'string') return fallback;
  const normalized = redacted.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_DISPLAY_ERROR_CHARS);
  return normalized || fallback;
};

const parseErrorText = (raw: string, fallback: string): string => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return coerceDisplayError(parsed.error ?? parsed.message, fallback);
  } catch {
    // Plain-text errors are allowed but still bounded and normalized.
  }
  return coerceDisplayError(raw, fallback);
};

export interface CreateCheckoutSessionOptions {
  supabaseUrl: unknown;
  priceId: unknown;
  jwtToken: unknown;
  origin: string;
  signal?: AbortSignal;
  fetchImplementation?: typeof fetch;
}

export const createCheckoutSession = async ({
  supabaseUrl,
  priceId: rawPriceId,
  jwtToken,
  origin,
  signal,
  fetchImplementation,
}: CreateCheckoutSessionOptions): Promise<{ url: string }> => {
  const endpoint = buildSupabaseFunctionUrl(supabaseUrl, 'create-checkout-session');
  const priceId = normalizeStripePriceId(rawPriceId);
  if (!endpoint || !priceId) throw new CheckoutSessionError('Checkout is not configured.');
  if (typeof jwtToken !== 'string' || !jwtToken || jwtToken === 'guest'
    || jwtToken.length > MAX_JWT_CHARS || /[\r\n]/.test(jwtToken)) {
    throw new CheckoutSessionError('A valid authenticated session is required.');
  }
  if (!origin || origin.length > 2048) throw new CheckoutSessionError('Application origin is invalid.');

  const response = await fetchWithTimeout(endpoint, {
    timeoutMs: CHECKOUT_TIMEOUT_MS,
    fetchImplementation,
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({
      priceId,
      successUrl: `${origin}?success=true`,
      cancelUrl: `${origin}?canceled=true`,
    }),
  });

  if (!response.ok) {
    const fallback = `Checkout request failed (${response.status}).`;
    try {
      const raw = await readResponseTextWithLimit(response, MAX_CHECKOUT_ERROR_CHARS);
      throw new CheckoutSessionError(parseErrorText(raw, fallback), response.status);
    } catch (error) {
      if (error instanceof CheckoutSessionError) throw error;
      if (error instanceof ResponseTooLargeError) {
        throw new CheckoutSessionError(`${fallback} Error response was too large.`, response.status);
      }
      throw error;
    }
  }

  const parsed = await readResponseJsonWithLimit(response, MAX_CHECKOUT_RESPONSE_CHARS);
  if (!isRecord(parsed)) throw new CheckoutSessionError('Checkout returned an invalid response.');
  if (!isSafeCheckoutRedirectUrl(parsed.url, origin)) {
    throw new CheckoutSessionError(coerceDisplayError(parsed.error, 'Checkout returned an unsafe redirect URL.'));
  }
  return { url: parsed.url };
};
