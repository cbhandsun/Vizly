import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sidebarCss = readFileSync(
  resolve(process.cwd(), 'src/core/components/diagrams/IconRailSidebar.css'),
  'utf8',
);

describe('page tab layering contract', () => {
  it('keeps the desktop drawer backdrop clear of bottom canvas controls', () => {
    expect(sidebarCss).toMatch(/\.side-drawer-backdrop\s*\{[^}]*bottom:\s*var\(--designer-bottom-chrome-clearance,\s*64px\)/s);
  });

  it('restores a full backdrop for the mobile drawer', () => {
    expect(sidebarCss).toMatch(/@media \(max-width: 768px\)[\s\S]*\.side-drawer-backdrop\s*\{[^}]*bottom:\s*0/s);
  });
});
