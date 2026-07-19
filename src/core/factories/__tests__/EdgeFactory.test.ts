import { MarkerType } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({
    edge: {
      strokeWidth: 2,
      markerEnd: { width: 14, height: 16 },
      obstaclePadding: 48,
    },
  })),
  getPreset: vi.fn(() => ({
    edges: {
      main: { color: '#111111', width: 3, arrow: { color: '#111111', width: 12, height: 13 } },
      dependency: { color: '#777777', width: 2, dash: '5 5', arrow: { color: '#777777', width: 10, height: 11 } },
      data: { color: '#00aacc', width: 2, dash: '6 4' },
      support: { color: '#cccccc', width: 1.5, dash: '3 3' },
      status: { color: '#aa00cc', width: 2, dash: '4 2' },
    },
  })),
}));

vi.mock('../../config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: mocks.getConfig,
  },
}));

vi.mock('../../components/shared/DiagramStyleManager', () => ({
  diagramStyleManager: {
    getPreset: mocks.getPreset,
  },
}));

vi.mock('../../config/ConfigIntegration', () => ({
  getConfigIntegration: () => ({
    getThemeManager: () => ({
      getCurrentTheme: () => ({
        typography: {
          fontSize: { sm: '12px' },
          fontFamily: 'Inter',
        },
        diagram: {
          canvas: { background: '#ffffff' },
          domains: {},
        },
      }),
      getCurrentThemeId: () => 'light',
      getEdgeColor: (_themeId: string, key: string) => ({
        main: key === 'primary' ? '#2255ff' : '#666666',
      }),
    }),
  }),
}));

import {
  EdgeFactory,
  EdgeStyleType,
  EdgeType,
} from '../EdgeFactory';

describe('EdgeFactory', () => {
  let factory: EdgeFactory;

  beforeEach(() => {
    factory = new EdgeFactory();
    mocks.getConfig.mockClear();
    mocks.getPreset.mockClear();
  });

  it('creates a styled default edge with normalized handles and endpoint marker', () => {
    const edge = factory.createEdge({
      source: 'a',
      target: 'b',
      label: 'A to B',
      sourceHandle: 'r-t',
      targetHandle: 'west',
      markerStart: true,
      data: { sourceDomainClass: 'wms' },
    });

    expect(edge.id).toBe('a-b');
    expect(edge.type).toBe(EdgeType.DEFAULT);
    expect(edge.label).toBe('A to B');
    expect(edge.data).toMatchObject({ label: 'A to B', pathType: 'bezier' });
    expect(edge.sourceHandle).toBe('right');
    expect(edge.targetHandle).toBe('left');
    expect(edge.style).toMatchObject({ stroke: '#111111', strokeWidth: 3 });
    expect(edge.labelStyle).toMatchObject({ fontSize: '12px', fontFamily: 'Inter', color: '#111111' });
    expect(edge.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: '#111111',
      width: 12,
      height: 13,
    });
    expect((edge as any).markerStart).toEqual(edge.markerEnd);
  });

  it('does not duplicate native labels for smart edges', () => {
    const edge = factory.createSmartEdge('source', 'target', EdgeType.SMART_STEP, {
      label: 'Smart label',
      sourceHandle: 'unknown',
      markerEnd: false,
    });

    expect(edge.type).toBe(EdgeType.SMART_STEP);
    expect(edge.label).toBeUndefined();
    expect(edge.data).toMatchObject({
      label: 'Smart label',
      pathType: 'smart-step',
      routingStrategy: 'interior-first',
      pathOptions: { gridRatio: 1.2 },
      obstaclePadding: 48,
    });
    expect(edge.sourceHandle).toBeNull();
    expect(edge.markerEnd).toBeUndefined();
  });

  it('throws for invalid required fields or non-positive stroke widths', () => {
    expect(() => factory.createEdge({ source: '', target: 'b' })).toThrow('源节点ID不能为空');
    expect(() => factory.createEdge({ source: 'a', target: '' })).toThrow('目标节点ID不能为空');
    expect(() => factory.createEdge({ source: 'a', target: 'b', strokeWidth: 0 })).toThrow('线条宽度必须大于0');
  });

  it('creates batch, sequential, domain, and many-to-many edges', () => {
    expect(factory.createEdges([
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ])).toHaveLength(2);

    expect(factory.createSequentialEdges(['a', 'b', 'c']).map(edge => edge.id)).toEqual(['a-b', 'b-c']);
    expect(factory.createDomainInternalEdges('d', ['a', 'b', 'c']).map(edge => edge.id)).toEqual([
      'd-a-d-b',
      'd-a-d-c',
      'd-b-d-c',
    ]);
    expect(factory.createManyToManyEdges(['s1', 's2'], ['t1', 't2'])).toHaveLength(4);
  });

  it('updates edge type, label, style, data, handles, animation, and marker sizes', () => {
    const edge = factory.createEdge({
      source: 'a',
      target: 'b',
      label: 'Original',
      markerEnd: true,
    });

    const updated = factory.updateEdge(
      {
        ...edge,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#000000' } as any,
      },
      {
        type: EdgeType.SMART_BEZIER,
        label: 'Updated',
        styleType: EdgeStyleType.DATA,
        sourceHandle: 'south',
        targetHandle: 'east',
        animated: true,
        strokeColor: '#123456',
        strokeWidth: 5,
        strokeDasharray: '1 2',
        style: { opacity: 0.5 },
        data: { custom: true },
      },
    );

    expect(updated.type).toBe(EdgeType.SMART_BEZIER);
    expect(updated.label).toBeUndefined();
    expect(updated.data).toMatchObject({
      label: 'Updated',
      pathType: 'smart-bezier',
      custom: true,
      routingStrategy: 'interior-first',
    });
    expect(updated.sourceHandle).toBe('bottom');
    expect(updated.targetHandle).toBe('right');
    expect(updated.animated).toBe(true);
    expect(updated.style).toMatchObject({
      stroke: '#123456',
      strokeWidth: 5,
      strokeDasharray: '1 2',
      opacity: 0.5,
    });
    expect((updated as any).labelStyle.color).toBe('#123456');
    expect((updated as any).markerEnd.width).toBe(14);
    expect((updated as any).markerEnd.height).toBe(16);
  });

  it('clones edges and returns defaults for native and smart types', () => {
    const edge = factory.createEdge({ id: 'edge-1', source: 'a', target: 'b' });

    expect(factory.cloneEdge(edge).id).toBe('edge-1_clone');
    expect(factory.cloneEdge(edge, 'copy').id).toBe('copy');
    expect(factory.getDefaultConfigForType(EdgeType.STRAIGHT)).toEqual({
      type: EdgeType.STRAIGHT,
      strokeWidth: 2,
      markerEnd: true,
    });
    expect(factory.getDefaultConfigForType(EdgeType.SMART_STRAIGHT)).toMatchObject({
      type: EdgeType.SMART_STRAIGHT,
      strokeWidth: 2,
      markerEnd: true,
      data: {
        routingStrategy: 'interior-first',
        pathOptions: { gridRatio: 0.9, avoidOverlap: true },
        obstaclePadding: 48,
      },
    });
  });
});
