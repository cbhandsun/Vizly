import { describe, expect, it } from 'vitest';
import { devCspPlugin, enableViteDevInlineScripts } from '../../../../vite-plugins/devCsp';

describe('Vite development CSP', () => {
  it('allows the inline React refresh preamble only for the development HTML transform', () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';">`;

    expect(enableViteDevInlineScripts(html)).toContain("script-src 'self' 'unsafe-inline';");
  });

  it('does not duplicate the development directive', () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';">`;

    expect(enableViteDevInlineScripts(html)).toBe(html);
  });

  it('leaves HTML without the expected CSP boundary unchanged', () => {
    const html = '<main>Vizly</main>';

    expect(enableViteDevInlineScripts(html)).toBe(html);
  });

  it('is restricted to the Vite serve command so production builds retain the strict CSP', () => {
    const plugin = devCspPlugin();

    expect(plugin.apply).toBe('serve');
    expect(plugin.enforce).toBe('pre');
  });
});
