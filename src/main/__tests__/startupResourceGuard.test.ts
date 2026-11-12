import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/assets/startup-resource-guard.v1.js', 'utf8');
afterEach(() => {
  window.dispatchEvent(new Event('vizly:entry-ready'));
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});
const install = (times = [0, 12], locationOverrides: Record<string, unknown> = {}) => {
  const reload = vi.fn();
  const now = vi.fn().mockReturnValueOnce(times[0]).mockReturnValue(times[1]);
  runInNewContext(source, { document, HTMLScriptElement, URLSearchParams, performance: { now }, window: {
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    location: { reload, ...locationOverrides },
  } });
  return reload;
};
const failScript = (type = 'module') => {
  const script = document.createElement('script'); script.type = type;
  script.src = 'https://private.invalid/private-token.js'; document.body.append(script);
  script.dispatchEvent(new Event('error'));
  document.dispatchEvent(new Event('DOMContentLoaded'));
};

describe('independent startup resource guard', () => {
  it('renders a safe failure once before the application module can execute', () => {
    const reload = install(); failScript(); failScript();
    expect(document.querySelectorAll('.startup-recovery')).toHaveLength(1);
    const summary = document.querySelector('textarea');
    expect(JSON.parse(summary?.value ?? '{}')).toEqual({ schema: 'vizly-startup-failure-v1',
      stage: 'resources', code: 'entry-resource-failed', elapsedMs: 12 });
    expect(summary?.readOnly).toBe(true);
    expect(summary?.value).not.toContain('private');
    expect(reload).not.toHaveBeenCalled();
    document.querySelector('button')?.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not intercept runtime exceptions, classic scripts or image failures', () => {
    install(); failScript('text/javascript');
    window.dispatchEvent(new ErrorEvent('error', { message: 'private' }));
    const img = document.createElement('img'); document.body.append(img); img.dispatchEvent(new Event('error'));
    expect(document.querySelector('.startup-recovery')).toBeNull();
  });

  it('uninstalls when the application entry executes', () => {
    install(); window.dispatchEvent(new Event('vizly:entry-ready')); failScript();
    expect(document.querySelector('.startup-recovery')).toBeNull();
  });

  it('cancels deferred recovery if the entry executes before DOM readiness', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    install();
    const script = document.createElement('script'); script.type = 'module'; document.body.append(script);
    script.dispatchEvent(new Event('error'));
    window.dispatchEvent(new Event('vizly:entry-ready'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.querySelector('.startup-recovery')).toBeNull();
  });

  it.each([NaN, Infinity, -1, 600001])('marks invalid elapsed time unavailable: %s', elapsed => {
    install([0, elapsed]); failScript();
    expect(JSON.parse(document.querySelector('textarea')?.value ?? '{}').elapsedMs).toBeNull();
  });

  it('installs before the module script without relaxing script CSP', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html.indexOf('startup-resource-guard.v1.js')).toBeLessThan(html.indexOf('src/main.tsx'));
    expect(html).toContain("script-src 'self';");
    expect(html).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(readFileSync('src/main.tsx', 'utf8')).toContain("window.dispatchEvent(new Event('vizly:entry-ready'))");
  });

  it('preloads only the active route chunks from build metadata', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'vizly-route-preloads');
    meta.setAttribute(
      'content',
      'diagram=/assets/canvas-runtime-Abc12345.js,/assets/DiagramViewerRoute-Def67890.js;manage=/assets/DiagramManagementPage-Ghi12345.js',
    );
    document.head.append(meta);

    install([0, 12], { pathname: '/', search: '', hash: '#/?diagram=wms-e2e-solution' });
    const diagramHrefs = [...document.head.querySelectorAll('link[rel="modulepreload"]')]
      .map(link => link.getAttribute('href'));
    expect(diagramHrefs).toEqual([
      '/assets/canvas-runtime-Abc12345.js',
      '/assets/DiagramViewerRoute-Def67890.js',
    ]);

    document.head.querySelectorAll('link[rel="modulepreload"]').forEach(link => link.remove());
    install([0, 12], { pathname: '/', search: '', hash: '' });
    const manageHrefs = [...document.head.querySelectorAll('link[rel="modulepreload"]')]
      .map(link => link.getAttribute('href'));
    expect(manageHrefs).toEqual(['/assets/DiagramManagementPage-Ghi12345.js']);

    document.head.querySelectorAll('link[rel="modulepreload"]').forEach(link => link.remove());
    install([0, 12], { pathname: '/', search: '', hash: '#/login' });
    expect(document.head.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(0);
  });
});
