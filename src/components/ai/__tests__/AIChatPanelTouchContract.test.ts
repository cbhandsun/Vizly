// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the actual host AI composer touch-safe', () => {
  const css = readFileSync('src/components/ai/AIChatPanel.css', 'utf8');
  expect(css).toMatch(/\.ai-chat-textarea[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important/);
});
