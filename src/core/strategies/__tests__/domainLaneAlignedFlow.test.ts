// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import logistics from '../../../data/standardized/LogisticsStandardData.json';
import wmsProcess from '../../../data/standardized/WmsProcessFlowStandardData.json';
import { DomainDagreLayoutStrategy } from '../DomainDagreLayoutStrategy';
import { LayoutType } from '../../types/layout';
import { withDisplayAbsolutePositions } from '../../components/shared/baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../../components/shared/baseReactFlowDisplayEdges.worker';
import { createDisplayRoutingIdentity } from '../../components/shared/baseReactFlowDisplayRoutingSession';
import { prepareLayeredLayoutEdges } from '../../components/diagrams/hooks/layeredLayoutEdgePreparation';
import { seedBaseReactFlowStagedLayoutEdges } from '../../components/shared/baseReactFlowLayoutRoutingTransaction';
import { clearBaseReactFlowLayoutEdgeRoutingData } from '../../components/shared/baseReactFlowLayoutEdgeRoutingData';
import { createBaseReactFlowDisplayEdgePatches } from '../../components/shared/baseReactFlowDisplayRoutingTransaction';
import type { DisplayEdgesWorkerRequest } from '../../components/shared/baseReactFlowDisplayWorkerProtocol';
import * as perimeterClosure from '../../components/shared/baseReactFlowDisplayPerimeterClosure';
import { auditFinalSameSideEndpointOrder } from '../shared/edgeFinalSameSideEndpointOrderRepair';
import { getNodeDimensions } from '../DomainDagreLayoutHelpers';
import { projectBaseReactFlowDisplayWorkerInput } from '../../components/shared/baseReactFlowDisplayWorkerProjection';
import { LayoutOptimizer } from '../../components/layout/LayoutOptimizer';
import { resolveDomainLaneSpacing } from '../../components/diagrams/flowchartLayoutStrategyMode';
import { auditBaseReactFlowDisplayCommercialQuality } from '../../components/shared/baseReactFlowDisplayCommercialQuality';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true, value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
  });
});

describe('shared process ranks with local branch separation', () => {
  // Production browser measurements, 1600x1200 viewport. Unlike the nested
  // fixture below, the built-in WMS Process preset has domains but no subdomains.
  const wmsDimensions: Record<string, [number, number]> = {
    'order-input': [260,96], allocation: [206,96], 'task-generate': [208,96], 'task-group': [206,96],
    operation: [319,73], 'labor-kpi': [215,96], 'order-import': [210,73], 'order-validate': [212,73],
    'order-sla-classify': [191,73], 'order-split-merge': [151,73], 'order-exception': [190,73],
    'atp-check': [167,73], reservation: [176,73], slotting: [190,73], 'batch-lot': [194,73],
    'wave-planning': [206,73], 'allocation-rollback': [170,73], 'pick-task-gen': [174,73],
    'replenish-task-gen': [151,73], 'sort-task-gen': [170,60], 'qc-task-gen': [135,73], 'pack-task-gen': [183,73],
    'wave-build': [190,73], 'zone-group': [170,73], 'container-assign': [174,73], 'priority-sequence': [186,60],
    'cutoff-grouping': [129,73], 'picking-exec': [170,73], 'replenish-exec': [167,73], 'sorting-exec': [167,73],
    'packing-exec': [178,60], 'qc-exec': [138,60], 'loading-handover': [178,60], 'wcs-integration': [208,73],
    'real-time-board': [134,73], 'uph-calc': [174,73], 'path-heatmap': [186,60], 'exception-alert': [190,73],
    'labor-schedule-feedback': [202,60],
  };
  const cases = [
    ...(['TB', 'LR', 'BT', 'RL'] as const).map(direction => ({ name: 'logistics', preset: logistics, direction, productionGeometry: false })),
    ...(['TB', 'LR'] as const).map(direction => ({ name: 'wms-process', preset: wmsProcess, direction, productionGeometry: false })),
    ...(['TB', 'LR'] as const).map(direction => ({ name: 'wms-production', preset: wmsProcess, direction, productionGeometry: true })),
  ];
  it.each(cases)('preserves business order and full routing quality in $name $direction', async ({ name, preset, direction, productionGeometry }) => {
    const dimensionsByDescription = new Map(preset.nodes.map(node => [node.description.trim(), wmsDimensions[node.id]]));
    const widthSpy = productionGeometry ? vi.spyOn(LayoutOptimizer.getInstance(), 'calculateNodeWidth')
      .mockImplementation(description => dimensionsByDescription.get(description)?.[0] ?? 240) : undefined;
    const heightSpy = productionGeometry ? vi.spyOn(LayoutOptimizer.getInstance(), 'calculateNodeHeight')
      .mockImplementation(description => dimensionsByDescription.get(description)?.[1] ?? 96) : undefined;
    const sizes = [[210,73],[259,118],[282,118],[298,118],[282,118],[282,96],[243,118],[250,118],[211,118],[296,118],[219,73]];
    const nodes: Node[] = preset.nodes.map((node, index) => {
      const dimensions = productionGeometry ? wmsDimensions[node.id] : sizes[index];
      const width = dimensions?.[0] ?? 240;
      const height = dimensions?.[1] ?? 96;
      return {
        id: node.id, type: 'custom', position: { x: 0, y: 0 },
        data: productionGeometry ? { ...node } : { ...node, subDomain: node.domain },
        width, height, measured: { width, height },
        ...(productionGeometry ? { style: { width, height } } : {}),
      };
    });
    const edges: Edge[] = preset.edges.map(({ id, source, target }) => ({ id, source, target, data: {} }));
    const options = {
      type: LayoutType.DAGRE, direction, nodeLayout: LayoutType.DAGRE,
      spacing: resolveDomainLaneSpacing(direction), padding: { top: 40, right: 20, bottom: 20, left: 20 },
      generateDomainGroups: true, generateSubDomainGroups: true, fitDomainContent: true,
      domainPlacement: 'ordered-lanes' as const, edgeRoutingQuality: 'interactive' as const,
      domainSubGroupDirection: direction, subDomainNodeDirection: direction,
    };
    let original: Awaited<ReturnType<DomainDagreLayoutStrategy['calculateLayout']>>;
    try {
      original = await new DomainDagreLayoutStrategy().calculateLayout(nodes, edges, options);
    } finally {
      widthSpy?.mockRestore();
      heightSpy?.mockRestore();
    }
    const absolute = withDisplayAbsolutePositions(original.nodes, new Map(original.nodes.map(node => [node.id, node])))
      .map((node: Node & { positionAbsolute?: Node['position'] }) => {
        const { positionAbsolute, ...rest } = node;
        return { ...rest, parentId: undefined, extent: undefined, position: positionAbsolute ?? node.position };
      });
    const arranged = absolute;
    const horizontal = direction === 'LR' || direction === 'RL';
    const flow = horizontal ? 'x' : 'y';
    const cross = horizontal ? 'y' : 'x';
    const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
    const byId = new Map(arranged.map(node => [node.id, node]));
    const chain = name === 'logistics' ? ['upstream', 'l-oms', 'visibility', 'downstream'] : ['order-input', 'allocation'];
    for (let index = 1; index < chain.length; index += 1) {
      const source = byId.get(chain[index - 1]);
      const target = byId.get(chain[index]);
      if (!source || !target) throw new Error('Missing semantic chain node');
      if (source.data.domain === target.data.domain) {
        expect((target.position[flow] - source.position[flow]) * sign).toBeGreaterThan(0);
      } else {
        const sourceSize = getNodeDimensions(source)[horizontal ? 'height' : 'width'];
        const targetSize = getNodeDimensions(target)[horizontal ? 'height' : 'width'];
        expect(Math.max(
          target.position[cross] - source.position[cross] - sourceSize,
          source.position[cross] - target.position[cross] - targetSize,
        )).toBeGreaterThan(0);
      }
    }
    if (name === 'logistics') {
      expect(arranged.filter(node => node.type === 'titleGroup').toSorted((a,b) => a.position[cross] - b.position[cross])
        .map(node => node.data.domain)).toEqual(['external', 'logistics', 'data']);
    }
    if (productionGeometry) {
      const flowDimension = horizontal ? 'width' : 'height';
      const laneExtents = arranged
        .filter(node => node.type === 'titleGroup')
        .map(node => getNodeDimensions(node)[flowDimension]);
      expect(new Set(laneExtents).size).toBe(1);
      expect(Math.max(...laneExtents)).toBeLessThan(horizontal ? 4_500 : 2_500);
    }
    const hierarchical = new Map(original.nodes.map(node => [node.id, node]));
    for (const node of original.nodes) {
      if (!node.parentId) continue;
      const parent = hierarchical.get(node.parentId);
      if (!parent) throw new Error('Missing semantic container');
      const size = getNodeDimensions(node);
      const parentSize = getNodeDimensions(parent);
      expect(node.position.x).toBeGreaterThanOrEqual(0);
      expect(node.position.y).toBeGreaterThanOrEqual(0);
      expect(node.position.x + size.width).toBeLessThanOrEqual(parentSize.width + 0.5);
      expect(node.position.y + size.height).toBeLessThanOrEqual(parentSize.height + 0.5);
    }
    const sourceEdges = prepareLayeredLayoutEdges(original.nodes, original.edges, direction, { promoteLockedComputedPath: true });
    const unseeded = sourceEdges.map(edge => ({ ...edge, data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data) }));
    const projected = projectBaseReactFlowDisplayWorkerInput({ nodes: original.nodes, edges: unseeded });
    const seed = seedBaseReactFlowStagedLayoutEdges({ sourceEdges, sourceNodes: original.nodes });
    const fallback = seedBaseReactFlowStagedLayoutEdges({ sourceEdges: unseeded, sourceNodes: original.nodes });
    const projectedSeed = projectBaseReactFlowDisplayWorkerInput({ nodes: original.nodes, edges: seed });
    const projectedFallback = projectBaseReactFlowDisplayWorkerInput({ nodes: original.nodes, edges: fallback });
    const candidatePatches = createBaseReactFlowDisplayEdgePatches(projected.edges, projectedSeed.edges);
    const fallbackCandidatePatches = createBaseReactFlowDisplayEdgePatches(projected.edges, projectedFallback.edges);
    if (!candidatePatches || !fallbackCandidatePatches) throw new Error('Invalid lane candidate patches');
    const request = {
      operation: 'repair-validate-or-route', requestId: 'aligned-lanes', nodes: projected.nodes, edges: projected.edges,
      fallbackCandidatePatches, candidatePatches, candidateSource: 'persistent', enableSmartEdges: true,
      smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 0, qualityMode: 'full',
      inputIdentity: createDisplayRoutingIdentity('1234', `geometry-v1:${'b'.repeat(32)}`),
    } satisfies DisplayEdgesWorkerRequest;
    const repairSpy = vi.spyOn(perimeterClosure, 'repairBaseReactFlowDisplayPerimeterClosure');
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse(request);
    const attempted = repairSpy.mock.calls.map(([paths, geometry]) => ({
      trunks: auditFinalSameSideEndpointOrder(paths, geometry).legalSharedTrunks,
      paths: paths.map(edge => ({ id: edge.id, path: edge.data?.computedPath })),
    }));
    repairSpy.mockRestore();
    expect(response.hardClean, JSON.stringify({ report: response.hardReport, attempted })).toBe(true);
    expect(response.hardReport, JSON.stringify(response.hardReport)).toMatchObject({
      hardClean: true, obstacleHits: 0, terminalsAttached: true, terminalsAnchored: true,
      minimumClearanceViolations: 0, commercialClearanceViolations: 0,
      quality: { nonOrthogonalSegments: 0, strictCrossings: 0, reverseOverlap: 0, unrelatedOverlap: 0 },
    });
    if (!response.edges) throw new Error('Missing full-route response edges');
    expect(
      auditBaseReactFlowDisplayCommercialQuality(response.edges),
      JSON.stringify(response.edges.map(edge => ({ id: edge.id, path: edge.data?.computedPath }))),
    ).toEqual([]);
  // Full production geometry routing is intentionally exercised under CI
  // coverage here. Its runtime budget is owned by the dedicated cold-routing
  // benchmark; this timeout only prevents coverage instrumentation from
  // aborting the correctness assertions on slower Windows runners.
  }, 45000);
});
