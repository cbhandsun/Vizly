import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({
    node: {
      minWidth: 80,
      maxWidth: 420,
      height: 60,
      padding: { horizontal: 12, vertical: 8 },
      font: { size: 16, family: 'Inter', weight: '400' },
    },
  })),
  getPreset: vi.fn(() => ({
    node: {
      paddingScale: 1,
      borderStyle: 'solid',
      borderWidth: 1,
      shadow: 'none',
      radius: 8,
      backgroundPolicy: 'theme',
    },
  })),
}));

vi.mock('../../config/DiagramConfig', () => ({
  diagramConfigManager: { getConfig: mocks.getConfig },
}));

vi.mock('../../components/shared/DiagramStyleManager', () => ({
  diagramStyleManager: { getPreset: mocks.getPreset },
}));

vi.mock('../../components/layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidthWithOverrides: () => 120,
      calculateNodeHeightWithOverrides: () => 60,
      calculateNodeWidth: () => 120,
      calculateNodeHeight: () => 60,
    }),
  },
}));

vi.mock('../../utils/domainKey', () => ({
  getDomainTheme: () => ({
    border: '#123456',
    background: '#ffffff',
  }),
}));

vi.mock('../../utils/EnhancedTextMeasurement', () => ({
  enhancedTextMeasurement: { measureMultipleNodes: () => [] },
}));

import { NodeFactory } from '../NodeFactory';

describe('NodeFactory', () => {
  let factory: NodeFactory;

  beforeEach(() => {
    factory = new NodeFactory();
    mocks.getConfig.mockClear();
    mocks.getPreset.mockClear();
  });

  it('creates a finite node and owns mutable input records', () => {
    const position = { x: 10, y: 20 };
    const style = { opacity: 0.5 };
    const data = { nested: { enabled: true } };
    const node = factory.createNode({
      id: 'node-1',
      description: 'Node 1',
      domainClass: 'generic',
      position,
      style,
      data,
    }, undefined, { width: 120, height: 70 });

    position.x = 999;
    style.opacity = 1;
    data.nested.enabled = false;

    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.width).toBe(128);
    expect(node.height).toBe(70);
    expect(node.style).toMatchObject({ opacity: 0.5, width: 128, height: 70 });
    expect((node.data as any).nested.enabled).toBe(true);
  });

  it('rejects malformed geometry before constructing a node', () => {
    expect(() => factory.createNode({
      id: 'node-1',
      description: 'Node 1',
      domainClass: 'generic',
      position: { x: Number.NaN, y: 0 },
    })).toThrow('节点位置必须是范围有效的有限数字');
  });
});
