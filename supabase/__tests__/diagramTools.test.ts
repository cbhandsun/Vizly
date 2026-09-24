import { describe, expect, it } from 'vitest';
import { diagramTools } from '../functions/ai-gateway/diagramTools';

interface SafeParseSchema {
  safeParse: (input: unknown) => { success: boolean };
}

const accepts = (tool: unknown, input: unknown): boolean => {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return false;
  const schema = (tool as { inputSchema?: unknown }).inputSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  const safeSchema = schema as Partial<SafeParseSchema>;
  return typeof safeSchema.safeParse === 'function' && safeSchema.safeParse(input).success;
};

describe('diagram gateway tool contracts', () => {
  it('requires a non-empty addNode label', () => {
    expect(accepts(diagramTools.addNode, { label: 'API Gateway' })).toBe(true);
    expect(accepts(diagramTools.addNode, {})).toBe(false);
    expect(accepts(diagramTools.addNode, { label: '   ' })).toBe(false);
  });

  it('accepts only flat string theme variables', () => {
    expect(accepts(diagramTools.updateTheme, {
      style: { 'primary-500': '#2563EB', 'node-border': '#CBD5E1' },
    })).toBe(true);
    expect(accepts(diagramTools.updateTheme, { style: { node: { fill: '#fff' } } })).toBe(false);
    expect(accepts(diagramTools.updateTheme, { style: { radius: 8 } })).toBe(false);
  });

  it('uses the flat animation payload documented by the prompt', () => {
    expect(accepts(diagramTools.animatePath, {
      ids: ['e1'],
      duration: 2_000,
      loop: false,
    })).toBe(true);
    expect(accepts(diagramTools.animatePath, {
      params: { edgeIds: ['e1'], options: { duration: 2_000, loop: false } },
    })).toBe(false);
  });
});
