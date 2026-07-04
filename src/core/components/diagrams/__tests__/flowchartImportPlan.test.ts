import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { buildFlowchartJsonImportPlan } from '../flowchartImportPlan';

const standardDiagramData = {
  id: 'diagram-1',
  name: 'Imported Diagram',
  type: 'flowchart',
  version: '1.0.0',
  nodes: [
    {
      id: 'node-standard',
      label: 'Node A',
      domain: 'ops',
    },
  ],
  edges: [],
};

describe('flowchartImportPlan', () => {
  it('uses plugin parsing results when standard data can be rendered directly', () => {
    const pluginNodes: Node[] = [
      {
        id: 'rf-node',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { label: 'Node A' },
      },
    ];

    const plan = buildFlowchartJsonImportPlan({
      data: standardDiagramData,
      activePlugin: {
        parseData: vi.fn(() => ({
          nodes: pluginNodes,
          edges: [],
        })),
      },
      fallbackId: 'fallback-id',
      fallbackTitle: 'Fallback Title',
      openedAt: '2026-06-25T00:00:00.000Z',
      invalidFormatMessage: 'invalid',
    });

    expect(plan).toEqual({
      kind: 'standard-plugin',
      nodes: pluginNodes,
      edges: [],
    });
  });

  it('falls back to reload registration when plugin parsing yields no canvas nodes', () => {
    const plan = buildFlowchartJsonImportPlan({
      data: standardDiagramData,
      activePlugin: {
        parseData: vi.fn(() => ({
          nodes: [],
          edges: [],
        })),
      },
      fallbackId: 'fallback-id',
      fallbackTitle: 'Fallback Title',
      openedAt: '2026-06-25T00:00:00.000Z',
      invalidFormatMessage: 'invalid',
    });

    expect(plan.kind).toBe('standard-reload');
    if (plan.kind !== 'standard-reload') {
      throw new Error('Expected standard-reload plan');
    }
    expect(plan.currentId).toBe('fallback-id');
    expect(plan.title).toBe('Imported Diagram');
    expect(plan.normalized.metadata?.openedAt).toBe('2026-06-25T00:00:00.000Z');
  });

  it('coerces React Flow clipboard graphs directly when standard-data markers are absent', () => {
    const plan = buildFlowchartJsonImportPlan({
      data: {
        nodes: [
          {
            id: 'rf-node',
            type: 'custom',
            position: { x: 12, y: 34 },
            data: { label: 'RF Node' },
          },
        ],
        edges: [],
      },
      fallbackId: 'fallback-id',
      fallbackTitle: 'Fallback Title',
      openedAt: '2026-06-25T00:00:00.000Z',
      invalidFormatMessage: 'invalid',
    });

    expect(plan).toEqual({
      kind: 'reactflow',
      nodes: [
        {
          id: 'rf-node',
          type: 'custom',
          position: { x: 12, y: 34 },
          data: { label: 'RF Node' },
        },
      ],
      edges: [],
    });
  });

  it('throws the provided invalid format message for unsupported payloads', () => {
    expect(() => buildFlowchartJsonImportPlan({
      data: { foo: 'bar' },
      fallbackId: 'fallback-id',
      fallbackTitle: 'Fallback Title',
      openedAt: '2026-06-25T00:00:00.000Z',
      invalidFormatMessage: 'Invalid data format',
    })).toThrow('Invalid data format');
  });
});
