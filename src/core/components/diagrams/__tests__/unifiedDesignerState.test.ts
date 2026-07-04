import { describe, expect, it } from 'vitest';

import type { DiagramTypePlugin } from '@/core/types/plugin';

import { resolveUnifiedDesignerCanvasState } from '../unifiedDesignerState';

const createPlugin = (overrides: Partial<DiagramTypePlugin> = {}): DiagramTypePlugin => ({
  id: 'test-plugin',
  name: 'Test Plugin',
  parseData: () => ({
    nodes: [{ id: 'parsed-node', position: { x: 1, y: 2 }, data: { label: 'Parsed' } }],
    edges: [{ id: 'parsed-edge', source: 'parsed-node', target: 'parsed-node' }],
  }),
  serializeData: () => ({}),
  getEmptyState: () => ({
    nodes: [{ id: 'empty-node', position: { x: 0, y: 0 }, data: { label: 'Empty' } }],
    edges: [],
  }),
  getSupportedLayouts: () => ['default'],
  getDefaultLayout: () => 'default',
  getNodeTypes: () => ({}),
  getEdgeTypes: () => ({}),
  addNode: undefined as never,
  ...overrides,
});

describe('resolveUnifiedDesignerCanvasState', () => {
  it('uses empty state when no initialData is provided', () => {
    const plugin = createPlugin();

    expect(resolveUnifiedDesignerCanvasState(plugin)).toEqual({
      nodes: [{ id: 'empty-node', position: { x: 0, y: 0 }, data: { label: 'Empty' } }],
      edges: [],
    });
  });

  it('parses initialData when provided', () => {
    const plugin = createPlugin();

    expect(resolveUnifiedDesignerCanvasState(plugin, { any: 'value' })).toEqual({
      nodes: [{ id: 'parsed-node', position: { x: 1, y: 2 }, data: { label: 'Parsed' } }],
      edges: [{ id: 'parsed-edge', source: 'parsed-node', target: 'parsed-node' }],
    });
  });

  it('normalizes invalid parse results to empty arrays', () => {
    const plugin = createPlugin({
      parseData: () => ({ nodes: null as never, edges: 'bad' as never }),
    });

    expect(resolveUnifiedDesignerCanvasState(plugin, { any: 'value' })).toEqual({
      nodes: [],
      edges: [],
    });
  });
});
