import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

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
});
