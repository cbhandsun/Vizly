import en from '../locales/en.json';
import zh from '../locales/zh.json';

const upstreamFetch = globalThis.fetch.bind(globalThis);
const localeResources = new Map<string, unknown>([
  ['/src/locales/en.json', en],
  ['/src/locales/zh.json', zh],
]);

const requestPathname = (input: string | URL | Request): string | null => {
  const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  try {
    return new URL(rawUrl, 'http://vitest.local').pathname;
  } catch {
    return null;
  }
};

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const locale = localeResources.get(requestPathname(input) ?? '');
  if (locale) {
    return new Response(JSON.stringify(locale), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  return upstreamFetch(input, init);
};
