// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../CommandPalette.css', import.meta.url), 'utf8');

describe('CommandPalette responsive layout contract', () => {
  it('bounds the palette to the dynamic viewport and keeps only vertical list scrolling', () => {
    expect(css).toMatch(
      /\.command-palette-surface\s*\{[\s\S]*?height:\s*min\(560px, calc\(100dvh - 16px\)\);[\s\S]*?overflow:\s*hidden;/,
    );
    expect(css).toMatch(
      /\.command-palette-list\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/,
    );
  });

  it('removes desktop-only metadata that crowds commands below 480px', () => {
    expect(css).toMatch(/@media \(max-width: 480px\)/);
    expect(css).toMatch(
      /\.command-palette-clear-label,[\s\S]*?\.command-palette-desktop-hint,[\s\S]*?\.command-palette-shortcut-hint\s*\{[\s\S]*?display:\s*none;/,
    );
    expect(css).toMatch(
      /\.command-palette-option-meta\s*\{[\s\S]*?display:\s*none !important;/,
    );
    expect(css).toMatch(
      /\.command-palette-option-title\s*\{[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
  });
});
