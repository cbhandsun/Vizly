import {
  fetchWithTimeout,
  readResponseJsonWithLimit,
} from '../core/utils/boundedResponse';

const LOCALE_FETCH_TIMEOUT_MS = 10_000;
const MAX_LOCALE_RESPONSE_CHARS = 512 * 1024;
const MAX_LOCALE_DEPTH = 16;
const MAX_LOCALE_ENTRIES = 10_000;
const MAX_LOCALE_KEY_LENGTH = 256;
const MAX_LOCALE_STRING_LENGTH = 20_000;
const UNSAFE_LOCALE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type LocaleResource = Record<string, unknown>;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const invalidLocaleResource = (): Error => new Error('Locale resource has invalid structure.');

const sanitizeLocaleRecord = (
  value: unknown,
  depth: number,
  state: { entryCount: number },
): LocaleResource => {
  if (!isPlainRecord(value) || depth > MAX_LOCALE_DEPTH) throw invalidLocaleResource();
  const sanitized: LocaleResource = {};
  for (const [key, child] of Object.entries(value)) {
    state.entryCount += 1;
    if (
      state.entryCount > MAX_LOCALE_ENTRIES
      || key.length === 0
      || key.length > MAX_LOCALE_KEY_LENGTH
      || UNSAFE_LOCALE_KEYS.has(key)
    ) throw invalidLocaleResource();
    if (typeof child === 'string') {
      if (child.length > MAX_LOCALE_STRING_LENGTH) throw invalidLocaleResource();
      sanitized[key] = child;
      continue;
    }
    sanitized[key] = sanitizeLocaleRecord(child, depth + 1, state);
  }
  return sanitized;
};

export const parseLocaleResource = (value: unknown): LocaleResource => (
  sanitizeLocaleRecord(value, 0, { entryCount: 0 })
);

export const loadLocaleResource = async (
  assetUrl: string,
  fetchImplementation?: typeof fetch,
): Promise<LocaleResource> => {
  if (assetUrl.length === 0 || assetUrl.length > 2_048) throw new Error('Invalid locale asset URL.');
  let response: Response;
  try {
    response = await fetchWithTimeout(assetUrl, {
      credentials: 'same-origin',
      fetchImplementation,
      headers: { Accept: 'application/json' },
      timeoutMs: LOCALE_FETCH_TIMEOUT_MS,
    });
  } catch {
    throw new Error('Locale resource request failed.');
  }
  if (!response.ok) throw new Error('Locale resource request returned an unsuccessful status.');
  return parseLocaleResource(await readResponseJsonWithLimit(
    response,
    MAX_LOCALE_RESPONSE_CHARS,
  ));
};
