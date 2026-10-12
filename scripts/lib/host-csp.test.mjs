// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(resolve(root, 'index.html'), 'utf8');
const parseHtml = html => new JSDOM(html).window.document;
const policy = document => {
  const metas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
  expect(metas).toHaveLength(1);
  return new Map(metas[0].getAttribute('content').split(';').filter(value => value.trim()).map(value => {
    const [name, ...tokens] = value.trim().split(/\s+/);
    return [name, tokens];
  }));
};

describe('host HTML CSP and the actual Vite development transform', () => {
  let server;
  let developmentHtml;
  beforeAll(async () => {
    server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'),
      cacheDir: resolve(root, 'node_modules/.vite-host-csp-tests'),
      server: { middlewareMode: true }, optimizeDeps: { force: false, noDiscovery: true, include: [] } });
    developmentHtml = await server.transformIndexHtml('/', source);
  });
  afterAll(async () => { await server?.close(); });

  it('keeps the application script policy strict without an obsolete unsafe-inline plugin', () => {
    const directives = policy(parseHtml(source));
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
    expect(readFileSync(resolve(root, 'vite.config.ts'), 'utf8')).not.toContain('devCspPlugin');
  });

  it('does not duplicate or broaden the policy during the real development transform', () => {
    expect([...policy(parseHtml(developmentHtml))]).toEqual([...policy(parseHtml(source))]);
  });

  it('loads React refresh with the current Vite transform before the enforcing meta boundary', () => {
    const document = parseHtml(developmentHtml);
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const preamble = [...document.querySelectorAll('script')].filter(script => script.textContent.includes('/@react-refresh'));
    expect(preamble).toHaveLength(1);
    expect(preamble[0].compareDocumentPosition(meta) & document.defaultView.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('script[src="/@vite/client"]')).not.toBeNull();
  });

  it('has no executable inline scripts in production source and guards startup before the app entry', () => {
    const document = parseHtml(source);
    const scripts = [...document.querySelectorAll('script')];
    expect(scripts.every(script => script.hasAttribute('src') && !script.textContent.trim())).toBe(true);
    expect(scripts.map(script => script.getAttribute('src'))).toEqual(['/assets/startup-resource-guard.v1.js', '/src/main.tsx']);
  });
});
