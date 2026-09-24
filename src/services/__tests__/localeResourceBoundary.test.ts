import { describe, expect, it, vi } from 'vitest';

import {
  loadLocaleResource,
  parseLocaleResource,
} from '../localeResourceBoundary';

describe('localeResourceBoundary', () => {
  it('parses and sanitizes a nested string resource', () => {
    const source = {
      common: {
        cancel: 'Cancel',
      },
    };

    const result = parseLocaleResource(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.common).not.toBe(source.common);
  });

  it.each([
    null,
    [],
    '',
    { value: null },
    { value: 1 },
    { value: true },
    { value: [] },
  ])('rejects an invalid locale shape: %j', value => {
    expect(() => parseLocaleResource(value)).toThrow('invalid structure');
  });

  it('rejects prototype-pollution keys', () => {
    const malicious = JSON.parse('{"safe":"ok","__proto__":{"polluted":"yes"}}') as unknown;

    expect(() => parseLocaleResource(malicious)).toThrow('invalid structure');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects excessive depth, entries, key length, and string length', () => {
    let deep: Record<string, unknown> = { value: 'ok' };
    for (let index = 0; index < 17; index += 1) deep = { child: deep };

    expect(() => parseLocaleResource(deep)).toThrow('invalid structure');
    expect(() => parseLocaleResource({ ['k'.repeat(257)]: 'value' })).toThrow('invalid structure');
    expect(() => parseLocaleResource({ value: 'x'.repeat(20_001) })).toThrow('invalid structure');
    expect(() => parseLocaleResource(Object.fromEntries(
      Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, 'value']),
    ))).toThrow('invalid structure');
  });

  it('loads a bounded same-origin locale response', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"common":{"cancel":"Cancel"}}', { status: 200 }),
    );

    await expect(loadLocaleResource('/assets/en.hash.json', fetchImplementation)).resolves.toEqual({
      common: { cancel: 'Cancel' },
    });
    expect(fetchImplementation).toHaveBeenCalledWith('/assets/en.hash.json', expect.objectContaining({
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }));
  });

  it('rejects empty, invalid JSON, oversized, and unsuccessful responses', async () => {
    const cases = [
      new Response('', { status: 200 }),
      new Response('{bad', { status: 200 }),
      new Response('x', { status: 200, headers: { 'Content-Length': String(512 * 1024 + 1) } }),
      new Response('{}', { status: 503 }),
    ];

    for (const response of cases) {
      const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(loadLocaleResource('/assets/locale.json', fetchImplementation)).rejects.toThrow();
    }
  });

  it('normalizes network failures without exposing the requested URL', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockRejectedValue(
      new Error('request to https://secret.example/token failed'),
    );

    await expect(loadLocaleResource('/assets/en.hash.json', fetchImplementation)).rejects.toThrow(
      'Locale resource request failed.',
    );
    await expect(loadLocaleResource('', fetchImplementation)).rejects.toThrow('Invalid locale asset URL.');
  });
});
