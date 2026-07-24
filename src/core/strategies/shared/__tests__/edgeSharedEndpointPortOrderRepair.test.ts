// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text || '').length * 8 }),
    }),
  });
});

import wmsStandardData from '../../../../data/standardized/WmsStandardData.json';
import { withDisplayAbsolutePositions } from '../../../components/shared/baseReactFlowDisplayEdgeCore';
import { standardDataToCanvas } from '../../../components/diagrams/designerUtils';
import { repairSharedEndpointPortOrderCrossings } from '../edgeSharedEndpointPortOrderRepair';
import { buildAdjacentTerminalSideEscapeCandidates } from '../edgeSharedEndpointPortOrderTerminalCandidates';
import { terminalSideIsFixed, withPath } from '../edgeSharedEndpointPortOrderGeometry';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';

const node = (
  id: string, x: number, y: number, width: number, height: number,
): Node & { positionAbsolute: { x: number; y: number } } => ({
  id,
  position: { x, y },
  positionAbsolute: { x, y },
  measured: { width, height },
  data: {},
});

describe('repairSharedEndpointPortOrderCrossings', () => {
  it('builds bounded adjacent-side candidates without mutating the input path', () => {
    const path = [
      { x: 50, y: 100 },
      { x: 50, y: 148 },
      { x: 200, y: 148 },
      { x: 200, y: 300 },
    ];
    const edge: Edge = {
      id: 'candidate-edge',
      source: 'shared',
      target: 'remote',
      sourceHandle: 'bottom',
    };

    const candidates = buildAdjacentTerminalSideEscapeCandidates(
      edge,
      path,
      'source',
      { x: 0, y: 0, width: 100, height: 100 },
      {
        edgeId: edge.id,
        edgeIndex: 0,
        segIdx: 1,
        pointCount: path.length,
        fromStart: 1,
        fromEnd: 2,
        a: path[1],
        b: path[2],
        axis: 'h',
      },
    );

    expect(path).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 148 },
      { x: 200, y: 148 },
      { x: 200, y: 300 },
    ]);
    expect(new Set(candidates.map(candidate => candidate.terminalSide)))
      .toEqual(new Set(['left', 'right']));
    expect(candidates.every(candidate => candidate.path.length >= 4)).toBe(true);
  });

  it('centralizes fixed and runtime terminal ownership when materializing a port side', () => {
    const manual: Edge = {
      id: 'manual',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-right-port-1',
      data: { _manualHandles: { source: true } },
    };
    const runtime: Edge = {
      id: 'runtime',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-top-runtime',
      data: { runtimeHandleLock: { source: true } },
    };

    expect(terminalSideIsFixed(manual, 'source')).toBe(true);
    expect(withPath(manual, [{ x: 0, y: 0 }, { x: 0, y: 20 }], 'source', 'left').sourceHandle)
      .toBe('source-right-port-1');
    expect(terminalSideIsFixed(runtime, 'source')).toBe(false);
    expect(withPath(runtime, [{ x: 0, y: 0 }, { x: 20, y: 0 }], 'source', 'left').sourceHandle)
      .toBe('left');
    expect(withPath(runtime, [{ x: 0, y: 0 }, { x: 0, y: 20 }], 'source', 'top').sourceHandle)
      .toBe('source-top-runtime');
  });

  it('moves a bent source port to the corridor side of a same-side target trunk', () => {
    const edges: Edge[] = [
      {
        id: 'feedback',
        source: 'shared',
        target: 'upstream',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 548, y: 1515 },
          { x: 548, y: 1451 },
          { x: 415, y: 1451 },
          { x: 415, y: 1339 },
          { x: 255, y: 1339 },
          { x: 255, y: 965 },
        ] },
      },
      {
        id: 'incoming',
        source: 'inventory',
        target: 'shared',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 516, y: 1355 },
          { x: 516, y: 1515 },
        ] },
      },
    ];
    const nodes = [
      node('shared', 407.6, 1515, 216, 96),
      node('upstream', 159, 869, 192, 96),
      node('inventory', 408, 1259, 216, 96),
    ];

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    const repaired = repairSharedEndpointPortOrderCrossings(edges, nodes);
    const path = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(path[0].x).toBeLessThan(516);
    expect(repaired[0].sourceHandle).toBe('left');
    expect(path[1].y).toBe(path[0].y);
    expect(path[0].x - path[1].x).toBeGreaterThanOrEqual(48);
    expect((repaired[0].data as any).sharedEndpointPortOrderRepaired).toBe(true);
  });

  it('leaves an explicitly fixed source position unchanged', () => {
    const edges: Edge[] = [
      {
        id: 'fixed-feedback',
        source: 'shared',
        target: 'upstream',
        sourceHandle: 'top',
        data: {
          sourcePortPolicy: 'fixed-pos',
          computedPath: [
            { x: 548, y: 1515 }, { x: 548, y: 1451 }, { x: 415, y: 1451 }, { x: 415, y: 965 },
          ],
        },
      },
      {
        id: 'incoming',
        source: 'inventory',
        target: 'shared',
        targetHandle: 'top',
        data: {
          targetPortPolicy: 'fixed-pos',
          computedPath: [{ x: 516, y: 1355 }, { x: 516, y: 1515 }],
        },
      },
    ];
    const nodes = [
      node('shared', 407.6, 1515, 216, 96),
      node('upstream', 159, 869, 192, 96),
      node('inventory', 408, 1259, 216, 96),
    ];

    expect(repairSharedEndpointPortOrderCrossings(edges, nodes)).toBe(edges);
  });

  it('moves a flexible straight trunk when the bent port is fixed', () => {
    const edges: Edge[] = [
      {
        id: 'fixed-feedback',
        source: 'shared',
        target: 'upstream',
        sourceHandle: 'top',
        data: {
          sourcePortPolicy: 'fixed-pos',
          computedPath: [
            { x: 548, y: 1515 }, { x: 548, y: 1451 }, { x: 415, y: 1451 }, { x: 415, y: 965 },
          ],
        },
      },
      {
        id: 'incoming',
        source: 'inventory',
        target: 'shared',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [{ x: 516, y: 1355 }, { x: 516, y: 1515 }] },
      },
    ];
    const nodes = [
      node('shared', 407.6, 1515, 216, 96),
      node('upstream', 159, 869, 192, 96),
      node('inventory', 407.6, 1259, 216, 96),
    ];

    const repaired = repairSharedEndpointPortOrderCrossings(edges, nodes);
    const incomingPath = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired[0].data as any).computedPath).toEqual((edges[0].data as any).computedPath);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(incomingPath.at(-1)?.x).toBeGreaterThan(548);
    expect((repaired[1].data as any).sharedEndpointPortOrderRepaired).toBe(true);
  });

  it('repairs the WMS shared OMS crossing behind a full connected corridor wall', async () => {
    const canvas = await standardDataToCanvas(wmsStandardData as any);
    const absoluteNodes = withDisplayAbsolutePositions(
      canvas.nodes,
      new Map(canvas.nodes.map(canvasNode => [canvasNode.id, canvasNode] as const)),
    );
    const oms = absoluteNodes.find(canvasNode => canvasNode.id === 'oms');
    expect(oms).toBeDefined();
    const crossingEdges: Edge[] = [
      {
        id: 'e_oms_so',
        source: 'oms',
        target: 'so',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { computedPath: [
          { x: 254, y: 968 },
          { x: 5330, y: 968 },
          { x: 5330, y: 858 },
          { x: 5306, y: 858 },
          { x: 5306, y: 494 },
          { x: 5402, y: 494 },
        ] },
      },
      {
        id: 'e_shipping_oms',
        source: 'shipping',
        target: 'oms',
        sourceHandle: 'left',
        targetHandle: 'right',
        data: { computedPath: [
          { x: 7072, y: 541 },
          { x: 6976, y: 541 },
          { x: 6976, y: 984 },
          { x: 350, y: 984 },
          { x: 350, y: 906 },
          { x: 254, y: 906 },
        ] },
      },
      {
        id: 'remote-lane-guard',
        source: 'guard-source',
        target: 'guard-target',
        data: { computedPath: [
          { x: 1000, y: 870 },
          { x: 1000, y: 900 },
        ] },
      },
      {
        id: 'e_md_oms',
        source: 'master-data',
        target: 'oms',
        sourceHandle: 'left',
        targetHandle: 'right',
        data: { computedPath: [
          { x: 4352, y: 496 },
          { x: 4244, y: 496 },
          { x: 4244, y: 698 },
          { x: 350, y: 698 },
          { x: 350, y: 906 },
          { x: 254, y: 906 },
        ] },
      },
      {
        id: 'e_md_erp',
        source: 'master-data',
        target: 'erp',
        data: { computedPath: [
          { x: 4352, y: 496 }, { x: 4256, y: 496 }, { x: 4256, y: 698 },
          { x: 386, y: 698 }, { x: 386, y: 638 }, { x: 290, y: 638 },
        ] },
      },
      {
        id: 'e_so_inv',
        source: 'so',
        target: 'inventory-view',
        data: { computedPath: [
          { x: 5402, y: 506 }, { x: 5306, y: 506 }, { x: 5306, y: 722 },
          { x: 2765, y: 722 }, { x: 2765, y: 710 }, { x: 2747, y: 710 },
          { x: 2747, y: 698 }, { x: 2729, y: 698 }, { x: 2729, y: 205 },
          { x: 2385, y: 205 },
        ] },
      },
      {
        id: 'e_md_so',
        source: 'master-data',
        target: 'so',
        data: { computedPath: [
          { x: 4512, y: 496 }, { x: 4602, y: 496 }, { x: 4602, y: 567 },
          { x: 5240, y: 567 }, { x: 5240, y: 486 }, { x: 5402, y: 486 },
        ] },
      },
      {
        id: 'e_shipping_bi',
        source: 'shipping',
        target: 'bi-reporting',
        data: { computedPath: [
          { x: 7072, y: 492 }, { x: 6983, y: 492 }, { x: 6983, y: 435 },
          { x: 5154, y: 435 }, { x: 5154, y: 496 }, { x: 5064, y: 496 },
        ] },
      },
    ];
    const fillerEdges: Edge[] = Array.from({ length: 33 }, (_, index) => ({
      id: `filler-${index}`,
      source: `filler-source-${index}`,
      target: `filler-target-${index}`,
      data: { computedPath: [
        { x: -100 - index * 64, y: -200 },
        { x: -100 - index * 64, y: -160 },
      ] },
    }));
    const edges = [...crossingEdges, ...fillerEdges];
    const nodes = absoluteNodes;

    expect(edges.length).toBeGreaterThan(32);
    const baselineQuality = calculateEdgePathQualityScore(edges);
    expect(baselineQuality.strictCrossings).toBe(1);

    const repaired = repairSharedEndpointPortOrderCrossings(edges, nodes);
    const feedbackPath = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(repairedQuality.strictCrossings).toBe(0);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(baselineQuality.nonOrthogonalSegments);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap)
      .toBeLessThanOrEqual(baselineQuality.unexplainedRelatedOverlap);
    expect(repairedQuality.shortEndpointStubs).toBeLessThanOrEqual(baselineQuality.shortEndpointStubs);
    expect(repairedQuality.tinyInteriorDoglegs).toBeLessThanOrEqual(baselineQuality.tinyInteriorDoglegs);
    expect(repairedQuality.hairpins).toBeLessThanOrEqual(baselineQuality.hairpins);
    expect(feedbackPath.at(-1)).toEqual({ x: 238, y: 975 });
    expect(feedbackPath).toContainEqual({ x: 6976, y: 541 });
    expect(feedbackPath.some(point => point.y > 984 && point.x < 6976)).toBe(true);
    expect(feedbackPath).not.toContainEqual({ x: 350, y: 984 });
    expect(repaired[1].targetHandle).toBe('bottom');
    expect((repaired[1].data as any).sharedEndpointPortOrderRepaired).toBe(true);

    const fixedTargetEdges = edges.map((edge, index) => (
      index === 1
        ? {
          ...edge,
          data: {
            ...(edge.data || {}),
            targetPortPolicy: 'fixed',
          },
        }
        : edge
    ));
    const fixedTargetResult = repairSharedEndpointPortOrderCrossings(fixedTargetEdges, nodes);
    expect(fixedTargetResult).toBe(fixedTargetEdges);
    expect(fixedTargetResult[1].targetHandle).toBe('right');
    expect(calculateEdgePathQualityScore(fixedTargetResult).strictCrossings).toBe(1);
  }, 20_000);
});
