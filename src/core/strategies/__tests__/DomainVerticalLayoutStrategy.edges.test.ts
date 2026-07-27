// @vitest-environment jsdom

import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import wmsData from '../../../data/standardized/WmsStandardData.json';
import { createBaseReactFlowFastDisplayEdges } from '../../components/shared/baseReactFlowDisplayEdgeCore';
import { LayoutType } from '../../types/layout';
import DomainVerticalLayoutStrategy from '../DomainVerticalLayoutStrategy';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text ?? '').length * 8 }),
    }),
  });
});

const includedNodeIds = new Set([
  'erp',
  'oms',
  'asn',
  'receipt',
  'putaway',
  'inventory-view',
  'so',
]);

const nodes: ReactFlowNode[] = wmsData.nodes
  .filter(node => includedNodeIds.has(node.id))
  .map(node => ({
  id: node.id,
  type: 'custom',
  position: { x: 0, y: 0 },
  measured: { width: 180, height: 80 },
  style: { width: 180, height: 80 },
  data: {
    ...node,
    label: node.description,
  },
  }));

const edges: Edge[] = wmsData.edges
  .filter(edge =>
    includedNodeIds.has(edge.source) && includedNodeIds.has(edge.target))
  .map(edge => ({
    ...edge,
    type: 'advanced-smart-step',
    data: { label: edge.label },
  }));

const isFinitePoint = (value: unknown): value is { x: number; y: number } => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

describe('DomainVerticalLayoutStrategy edge preservation', () => {
  it('keeps every WMS edge renderable after final domain-width normalization', async () => {
    const result = await new DomainVerticalLayoutStrategy().calculateLayout(
      nodes,
      edges,
      {
        type: LayoutType.VERTICAL,
        nodeLayout: LayoutType.HORIZONTAL,
        direction: 'TB',
        generateDomainGroups: true,
        generateSubDomainGroups: true,
        fitDomainContent: true,
        padding: { top: 40, right: 20, bottom: 20, left: 20 },
      } as never,
    );

    expect(result.edges).toHaveLength(edges.length);
    for (const edge of result.edges) {
      const path = edge.data?.computedPath;
      expect(Array.isArray(path) && path.length >= 2).toBe(true);
      expect((path as unknown[]).every(isFinitePoint)).toBe(true);
      expect(edge.data?.layoutPathLocked).toBe(true);
    }

    const displayEdges = createBaseReactFlowFastDisplayEdges({
      edges: result.edges,
      nodes: result.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
    });
    expect(displayEdges).toHaveLength(edges.length);
    expect(displayEdges.every(edge => edge.type === 'stablePath')).toBe(true);
    expect(displayEdges.every(edge =>
      Array.isArray(edge.data?.computedPath)
      && edge.data.computedPath.length >= 2)).toBe(true);
  }, 30_000);
});
