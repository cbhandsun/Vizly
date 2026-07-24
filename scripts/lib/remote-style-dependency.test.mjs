import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('critical route style dependencies', () => {
  it('does not require remote stylesheets to render the application shell', () => {
    const criticalSources = [
      read('index.html'),
      read('src/pages/WorkspaceDashboard.css'),
    ];

    for (const source of criticalSources) {
      expect(source).not.toMatch(/fonts\.googleapis\.com/i);
      expect(source).not.toMatch(/@import\s+url\(\s*['"]?https?:\/\//i);
    }
  });

  it('ships a restrictive baseline CSP with the static application shell', () => {
    const indexHtml = read('index.html');
    const csp = indexHtml.match(
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i,
    )?.[1];

    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(indexHtml).toContain('name="referrer" content="strict-origin-when-cross-origin"');
  });
});
