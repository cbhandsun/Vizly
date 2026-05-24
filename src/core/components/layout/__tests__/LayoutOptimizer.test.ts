import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const layoutConfig = {
    NODE_MIN_WIDTH: 120,
    NODE_PADDING: { horizontal: 16, vertical: 10 },
    NODE_H_GAP: 40,
    NODE_V_GAP: 30,
    GROUP_PADDING: { H: 50, V: 45 },
    SUB_GROUP_PADDING: { H: 24, V_TOP: 34, V_BOTTOM: 18 },
    SUB_GROUP_TITLE_CLEARANCE: 42,
    ENSURE_SUB_GROUP_TITLE_CLEARANCE: true,
    GROUP_TITLE_HEIGHT: 40,
    GROUP_TITLE_SAFE_GAP: 12,
    GROUP_SIDE_SAFE_GAP: 10,
    GROUP_BOTTOM_SAFE_GAP: 16,
    SUB_GROUP_TITLE_HEIGHT: 28,
    SUB_GROUP_TITLE_SAFE_GAP: 8,
    DOMAIN_H_GAP: 70,
    BE_COLUMN_GAP: 60,
    NODE_FONT_SIZE: 20,
    NODE_FONT_FAMILY: 'Inter',
    NODE_FONT_WEIGHT: '500',
  };
  const fullConfig = {
    node: { maxWidth: 260 },
  };
  const listeners: Array<() => void> = [];
  const splitLines = (text: string) => String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const measureNodeContent = vi.fn((text: string, options: any = {}) => {
    const lines = splitLines(text);
    const fontSize = options.fontSize || 20;
    const paddingH = options.padding?.horizontal || 0;
    const paddingV = options.padding?.vertical || 0;
    const widths = lines.map(line => line.length * fontSize * 0.5);
    const maxLineWidth = Math.max(0, ...widths);
    return {
      lines,
      maxLineWidth,
      width: maxLineWidth + paddingH * 2,
      height: Math.ceil(lines.length * fontSize * 1.4 + paddingV * 2),
    };
  });
  const measureMultipleNodes = vi.fn((texts: string[], options: any = {}) =>
    texts.map(text => measureNodeContent(text, options))
  );

  return { layoutConfig, fullConfig, listeners, measureNodeContent, measureMultipleNodes };
});

vi.mock('../../config/DiagramConfig', () => ({
  diagramConfigManager: {
    getLayoutConfig: () => mockState.layoutConfig,
    getConfig: () => mockState.fullConfig,
    addConfigChangeListener: (listener: () => void) => {
      mockState.listeners.push(listener);
      return () => undefined;
    },
  },
}));

vi.mock('../../../utils/EnhancedTextMeasurement', () => ({
  enhancedTextMeasurement: {
    measureNodeContent: mockState.measureNodeContent,
    measureMultipleNodes: mockState.measureMultipleNodes,
  },
}));

import { LayoutOptimizer } from '../LayoutOptimizer';

describe('LayoutOptimizer', () => {
  let optimizer: LayoutOptimizer;

  beforeEach(() => {
    mockState.measureNodeContent.mockClear();
    mockState.measureMultipleNodes.mockClear();
    mockState.listeners.length = 0;
    mockState.fullConfig.node.maxWidth = 260;
    optimizer = new LayoutOptimizer();
    optimizer.clearCache();
  });

  it('measures the longest cleaned line and falls back for empty node widths', () => {
    expect(optimizer.calculateNodeWidth('')).toBe(120);
    expect(optimizer.measureLongestLineWidth('<b>Short</b>\nA much longer line')).toBe(180);
    expect(mockState.measureNodeContent).toHaveBeenCalled();
  });

  it('calculates node width with cache, max-width clamping, and bullet exemption', () => {
    const first = optimizer.calculateNodeWidth('Very long node title\nwith body content');
    const callsAfterFirst = mockState.measureNodeContent.mock.calls.length;
    const second = optimizer.calculateNodeWidth('Very long node title\nwith body content');

    expect(first).toBe(260);
    expect(second).toBe(first);
    expect(mockState.measureNodeContent.mock.calls.length).toBe(callsAfterFirst);
    expect(optimizer.getCacheStats().size).toBe(1);
    expect(optimizer.getCacheStats().hitRate).toBeGreaterThan(0);

    const bullet = optimizer.calculateNodeWidth('• extremely long bullet point that may exceed the max width');
    expect(bullet).toBeGreaterThan(260);
  });

  it('supports override-based width and height measurement', () => {
    expect(optimizer.calculateNodeWidthWithOverrides('', { minWidth: 90 })).toBe(90);

    const width = optimizer.calculateNodeWidthWithOverrides('Compact content', {
      fontSize: 12,
      padding: { horizontal: 4, vertical: 4 },
      minWidth: 80,
      scale: 0.5,
      maxWidth: 140,
    });
    expect(width).toBe(80);

    const height = optimizer.calculateNodeHeightWithOverrides('Title\nbody line', {
      fontSize: 12,
      padding: { horizontal: 4, vertical: 6 },
      minHeight: 40,
      maxWidth: 140,
    });
    expect(height).toBeGreaterThanOrEqual(45);
  });

  it('calculates batch node widths and heights with compact-domain scaling', () => {
    const normalWidths = optimizer.calculateMultipleNodeWidths(['Alpha', 'Beta beta']);
    const compactWidths = optimizer.calculateMultipleNodeWidths(['Alpha', 'Beta beta'], { domainKey: 'data' });
    const heights = optimizer.calculateMultipleNodeHeights(['Alpha', 'Beta\nbeta'], { domainKey: 'data' });

    expect(normalWidths).toHaveLength(2);
    expect(compactWidths[0]).toBeLessThanOrEqual(normalWidths[0]);
    expect(heights).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(mockState.measureMultipleNodes).toHaveBeenCalled();
  });

  it('calculates subdomain, domain, and unified canvas dimensions', () => {
    const scm = {
      title: 'SCM',
      nodes: ['a', 'b', 'c', 'd', 'e', 'f'],
      descs: ['A', 'B', 'C', 'D', 'E', 'F'],
    };
    const logistics = {
      title: 'Logistics',
      nodes: ['a', 'b', 'c', 'd', 'e'],
      descs: ['A', 'B', 'C', 'D', 'E'],
    };
    const single = {
      title: 'Single',
      nodes: ['a', 'b'],
      descs: ['A', 'B'],
    };
    const masterData = {
      'be-scm': scm,
      'be-logistics': logistics,
      'be-corp': single,
      mid: {
        title: 'Middle',
        nodes: Array.from({ length: 10 }, (_, i) => `m${i}`),
        descs: Array.from({ length: 10 }, (_, i) => `Middle ${i}`),
      },
      data: single,
    };

    expect(optimizer.calculateSubDomainWidth(['A', 'B'], 'single')).toBeGreaterThan(160);
    expect(optimizer.calculateSubDomainWidth(['A', 'B'], 'double')).toBeGreaterThan(optimizer.calculateSubDomainWidth(['A'], 'single'));
    expect(optimizer.calculateDomainWidth([100, 120], ['A', 'B'], 'horizontal')).toBeGreaterThan(250);
    expect(optimizer.calculateDomainWidth([100, 120], [], 'vertical')).toBe(280);

    expect(optimizer.calculateBackendDomainMinWidth(null as never)).toBe(800);
    expect(optimizer.calculateBackendDomainMinHeight(null as never)).toBe(400);
    expect(optimizer.calculateComplexDomainWidth('missing', masterData)).toBe(800);
    expect(optimizer.calculateComplexDomainHeight('missing', masterData)).toBe(400);

    const allWidths = optimizer.calculateAllDomainWidths(masterData);
    expect(allWidths.backend).toBeGreaterThan(0);
    expect(allWidths.mid).toBeGreaterThan(0);
    expect(optimizer.calculateUnifiedDomainWidth(masterData)).toBeGreaterThanOrEqual(1200);
    expect(optimizer.calculateAdaptiveCanvasWidth(masterData)).toBeGreaterThan(1200);
    expect(optimizer.calculateSingleLayerDomainHeight(single, 'data')).toBeGreaterThan(80);
    expect(optimizer.calculateBackendComplexDomainHeight(masterData)).toBeGreaterThan(100);
  });

  it('clears cached measurements when configuration changes', () => {
    optimizer.calculateNodeWidth('Cache me');
    expect(optimizer.getCacheStats().size).toBe(1);

    mockState.listeners[mockState.listeners.length - 1]();

    expect(optimizer.getCacheStats().size).toBe(0);
  });
});
