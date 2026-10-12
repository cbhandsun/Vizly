// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('actual host toolbar composition contract', () => {
  const source = readFileSync('src/components/ui/ModernTopToolbar.tsx', 'utf8');
  it('localizes the command search entry', () => {
    expect(source).toContain("t('designer.commandPalette.open', 'Open command search')");
  });
  it('allows the plugin toolbar portal to shrink within available width', () => {
    expect(source).toMatch(/vizly-plugin-context-toolbar-portal[\s\S]*?min-w-0 max-w-full[\s\S]*?flex-1 w-full/);
  });
});
