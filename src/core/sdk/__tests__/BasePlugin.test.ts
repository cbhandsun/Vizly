import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/shared/DiagramStyleManager', () => ({
  diagramStyleManager: {
    getPreset: () => ({
      edges: {
        main: { color: '#123456', width: 2, dash: '4 2', arrow: { width: 12, height: 14 } },
      },
    }),
  },
}));

import { BaseDiagramPlugin } from '../BasePlugin';

class TestPlugin extends BaseDiagramPlugin {
  id = 'test';
  name = 'Test';
}

describe('BaseDiagramPlugin', () => {
  it('rejects non-object and malformed React Flow inputs', () => {
    const plugin = new TestPlugin();
    expect(plugin.parseData(null)).toEqual({ nodes: [], edges: [] });
    expect(plugin.parseData({
      nodes: [{ id: 'bad', position: { x: Infinity, y: 0 }, data: {} }],
      edges: [],
    })).toEqual({ nodes: [], edges: [] });
  });

  it('validates React Flow input and injects default edge rendering', () => {
    const plugin = new TestPlugin();
    const result = plugin.parseData({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }],
      edges: [{ id: 'e', source: 'a', target: 'a' }],
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      style: { stroke: '#123456', strokeWidth: 2, strokeDasharray: '4 2' },
      markerEnd: { color: '#123456', width: 12, height: 14 },
    });
  });

  it('preserves generic migration and serialization payloads', async () => {
    const plugin = new TestPlugin();
    const payload = { custom: true };
    await expect(plugin.migrate(payload, '0.9')).resolves.toBe(payload);
    expect(plugin.serializeData([], [])).toEqual({ nodes: [], edges: [] });
  });
});
