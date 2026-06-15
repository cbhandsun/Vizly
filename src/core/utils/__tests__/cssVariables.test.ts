import { describe, expect, it } from 'vitest';
import { renderCssVariableBlock, sanitizeCssVariableDeclarations } from '../cssVariables';

describe('cssVariables', () => {
  it('keeps safe theme color variables', () => {
    expect(sanitizeCssVariableDeclarations({
      'primary-500': '#6366f1',
      'bg-main': 'rgba(255, 255, 255, 0.85)',
      'node-border': 'hsl(240, 10%, 40%)',
    })).toEqual([
      '  --primary-500: #6366f1 !important;',
      '  --bg-main: rgba(255, 255, 255, 0.85) !important;',
      '  --node-border: hsl(240, 10%, 40%) !important;',
    ]);
  });

  it('drops declarations that could escape the CSS variable block', () => {
    const css = renderCssVariableBlock({
      'primary-500': '#6366f1',
      'bad};body{color': 'red',
      'bg-main': 'red; } body { background: url(javascript:alert(1))',
      'node-border': 'url(https://example.com/x)',
    });

    expect(css).toContain('--primary-500');
    expect(css).not.toContain('body');
    expect(css).not.toContain('javascript:');
    expect(css).not.toContain('url(');
  });
});
