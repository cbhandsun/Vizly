// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { closeBaseReactFlowDisplayFinalHardContract } from '../baseReactFlowDisplayFinalHardContract';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  type: 'process',
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

describe('baseReactFlowDisplayFinalHardContract', () => {
  it('closes an independent strict crossing before committing a paired feedback-port repair', () => {
    const nodes: Node[] = [
      node('allocation', 1079.8, 1417.5, 206, 96),
      node('wave-planning', 1605.8, 1895, 206, 73),
      node('labor-feedback', 6144.85, 1552, 202, 60),
      node('incoming', 9800, 100, 50, 100),
      node('labor', 9900, 100, 100, 100),
      node('task-group', 9500, 100, 100, 100),
      node('downstream', 9700, 100, 50, 100),
    ];
    const edges: Edge[] = [
      {
        id: 'wave-plan', source: 'allocation', target: 'wave-planning',
        sourceHandle: 'bottom', targetHandle: 'left',
        data: { computedPath: [
          { x: 1286, y: 1514 }, { x: 1286, y: 1586 },
          { x: 1334, y: 1586 }, { x: 1334, y: 1932 }, { x: 1606, y: 1932 },
        ] },
      },
      {
        id: 'labor-allocation', source: 'labor-feedback', target: 'allocation',
        sourceHandle: 'bottom', targetHandle: 'right',
        data: { computedPath: [
          { x: 6145, y: 1612 }, { x: 6145, y: 2081 },
          { x: 1350, y: 2081 }, { x: 1350, y: 1498 }, { x: 1285.8, y: 1498 },
        ] },
      },
      {
        id: 'incoming-labor', source: 'incoming', target: 'labor',
        sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [{ x: 9850, y: 150 }, { x: 9900, y: 150 }] },
      },
      {
        id: 'feedback', source: 'labor', target: 'task-group',
        sourceHandle: 'left', targetHandle: 'right',
        data: {
          autoSource: true,
          autoTarget: true,
          auto: ['source', 'target'],
          runtimeHandleLock: { source: true, target: true },
          computedPath: [
            { x: 9900, y: 150 }, { x: 9900, y: 50 },
            { x: 9600, y: 50 }, { x: 9600, y: 150 },
          ],
        },
      },
      {
        id: 'task-downstream', source: 'task-group', target: 'downstream',
        sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [{ x: 9600, y: 150 }, { x: 9700, y: 150 }] },
      },
    ];

    const outcome = closeBaseReactFlowDisplayFinalHardContract(edges, nodes);
    const feedback = outcome.edges.find(edge => edge.id === 'feedback');

    expect(outcome.report.hardClean, JSON.stringify(outcome.report, null, 2)).toBe(true);
    expect(outcome.report.quality.strictCrossings).toBe(0);
    expect(outcome.report.obstacleHits).toBe(0);
    expect(feedback?.sourceHandle).not.toBe('left');
    expect(feedback?.targetHandle).not.toBe('right');
  });

  it('moves a crossed short fan-out branch onto a safe same-source peer trunk', () => {
    const nodes: Node[] = [
      node('operation', 3997.65, 776.5, 319, 73),
      node('loading', 4651.65, 1223, 178, 60),
      node('real-time', 5127.85, 1312.5, 134, 73),
      node('wcs', 4637, 1443.5, 178, 73),
    ];
    const auto = {
      autoSource: true,
      autoTarget: true,
      auto: ['source', 'target'],
      runtimeHandleLock: { source: true, target: true },
    };
    const edges: Edge[] = [
      {
        id: 'loading', source: 'operation', target: 'loading',
        sourceHandle: 'bottom', targetHandle: 'left',
        data: { ...auto, computedPath: [
          { x: 4317, y: 850 }, { x: 4317, y: 1253 }, { x: 4652, y: 1253 },
        ] },
      },
      {
        id: 'real-time', source: 'operation', target: 'real-time',
        sourceHandle: 'right', targetHandle: 'left',
        data: { ...auto, computedPath: [
          { x: 4317, y: 850 }, { x: 4372, y: 850 },
          { x: 4372, y: 1349 }, { x: 5128, y: 1349 },
        ] },
      },
      {
        id: 'wcs', source: 'operation', target: 'wcs',
        sourceHandle: 'right', targetHandle: 'left',
        data: { ...auto, computedPath: [
          { x: 4317, y: 850 }, { x: 4373, y: 850 },
          { x: 4373, y: 1175 }, { x: 4842, y: 1175 },
          { x: 4842, y: 1331 }, { x: 4372, y: 1331 },
          { x: 4372, y: 1480 }, { x: 4637, y: 1480 },
        ] },
      },
    ];

    const outcome = closeBaseReactFlowDisplayFinalHardContract(edges, nodes);
    const loading = outcome.edges.find(edge => edge.id === 'loading');

    expect(outcome.report.hardClean, JSON.stringify(outcome.report, null, 2)).toBe(true);
    expect(outcome.report.quality.strictCrossings).toBe(0);
    expect(outcome.report.obstacleHits).toBe(0);
    expect(loading?.sourceHandle).toBe('right');
    expect(loading?.data?.computedPath).toEqual([
      { x: 4317, y: 850 }, { x: 4372, y: 850 },
      { x: 4372, y: 1253 }, { x: 4651.65, y: 1253 },
    ]);
  });
});
