// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import logistics from '../../../data/standardized/LogisticsStandardData.json';
import { DomainDagreLayoutStrategy } from '../DomainDagreLayoutStrategy';
import { LayoutType } from '../../types/layout';
import { withDisplayAbsolutePositions } from '../../components/shared/baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../../components/shared/baseReactFlowDisplayEdges.worker';
import { createDisplayRoutingIdentity } from '../../components/shared/baseReactFlowDisplayRoutingSession';
import { prepareLayeredLayoutEdges } from '../../components/diagrams/hooks/layeredLayoutEdgePreparation';
import { seedBaseReactFlowStagedLayoutEdges } from '../../components/shared/baseReactFlowLayoutRoutingTransaction';
import { clearBaseReactFlowLayoutEdgeRoutingData } from '../../components/shared/baseReactFlowLayoutEdgeRoutingData';
import browserRequest from './fixtures/logisticsLaneRequest.json';
import { parseDisplayEdgesWorkerRequest } from '../../components/shared/baseReactFlowDisplayWorkerProtocol';
import { prepareDomainDagreEdges } from '../DomainDagreEdgePreparation';

const sizes = [
  [210, 73], [259, 118], [282, 118], [298, 118], [282, 118], [282, 96],
  [243, 118], [250, 118], [211, 118], [296, 118], [219, 73],
];

const cleanReport = {
  hardClean: true,
  obstacleHits: 0,
  terminalsAttached: true,
  terminalsAnchored: true,
  minimumClearanceViolations: 0,
  commercialClearanceViolations: 0,
  quality: { nonOrthogonalSegments: 0, strictCrossings: 0, reverseOverlap: 0, unrelatedOverlap: 0 },
};

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
  });
});

describe('ordered Logistics swimlane routing', () => {
  it('repairs the exact browser TB candidate', async () => {
    const request = parseDisplayEdgesWorkerRequest(browserRequest);
    if (!request) throw new Error('Invalid browser regression fixture');
    const geometry = structuredClone(request.nodes);
    const repaired = await prepareDomainDagreEdges({
      nodes: request.nodes,
      edges: request.edges,
      nodeById: new Map(request.nodes.map(node => [node.id, node])),
      leafNodes: request.nodes.filter(node => node.type === 'custom'),
      options: {
        type: LayoutType.DAGRE, direction: 'TB',
        domainPlacement: 'ordered-lanes', edgeRoutingQuality: 'interactive',
      },
      config: {},
    });
    const prepared = prepareLayeredLayoutEdges(request.nodes, repaired, 'TB', { promoteLockedComputedPath: true });
    const preparedSource = prepared.map(edge => ({
      ...edge, data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data),
    }));
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'repair-validate-or-route',
      requestId: request.requestId, inputIdentity: request.inputIdentity,
      nodes: request.nodes, candidateSource: 'persistent',
      fallbackCandidateEdges: seedBaseReactFlowStagedLayoutEdges({
        sourceEdges: preparedSource, sourceNodes: request.nodes,
      }),
      edges: preparedSource,
      candidateEdges: seedBaseReactFlowStagedLayoutEdges({ sourceEdges: prepared, sourceNodes: request.nodes }),
      enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 0, qualityMode: 'full',
    });
    expect(response.hardClean).toBe(true);
    expect(response.hardReport).toMatchObject(cleanReport);
    expect(response.edges).toHaveLength(request.edges.length);
    expect(request.nodes).toEqual(geometry);
  }, 30000);
  it.each(['TB', 'LR'] as const)('routes the complete measured graph in %s without replacing lane geometry', async direction => {
    const nodes: Node[] = logistics.nodes.map((node, index) => ({
      id: node.id, type: 'custom', position: { x: 0, y: 0 },
      data: { ...node, subDomain: node.domain },
      measured: { width: sizes[index][0], height: sizes[index][1] },
      width: sizes[index][0], height: sizes[index][1],
    }));
    const edges: Edge[] = logistics.edges.map(({ id, source, target }) => ({ id, source, target, data: {} }));
    const layout = await new DomainDagreLayoutStrategy().calculateLayout(nodes, edges, {
      // The two common-scenario menu entries request automatic Dagre layering.
      // FLOW is a separate wrapping arrangement, not the menu's node layout.
      type: LayoutType.DAGRE, direction, nodeLayout: LayoutType.DAGRE,
      spacing: { horizontal: 120, vertical: 120 },
      padding: { top: 40, right: 20, bottom: 20, left: 20 },
      generateDomainGroups: true, generateSubDomainGroups: true,
      fitDomainContent: true, domainPlacement: 'ordered-lanes',
      edgeRoutingQuality: 'interactive',
      domainSubGroupDirection: direction, subDomainNodeDirection: direction,
    });
    const absoluteNodes = withDisplayAbsolutePositions(layout.nodes, new Map(layout.nodes.map(n => [n.id, n])));
    const domains = absoluteNodes.filter(node => node.type === 'titleGroup');
    expect(domains).toHaveLength(3);
    const crossAxis = direction === 'TB' ? 'x' : 'y';
    const flowAxis = direction === 'TB' ? 'y' : 'x';
    expect(new Set(domains.map(node => node.position[flowAxis])).size).toBe(1);
    expect(new Set(domains.map(node => node.position[crossAxis])).size).toBe(3);
    const geometry = structuredClone(layout.nodes);
    const sourceEdges = prepareLayeredLayoutEdges(layout.nodes, layout.edges, direction, { promoteLockedComputedPath: true });
    const seed = seedBaseReactFlowStagedLayoutEdges({ sourceEdges, sourceNodes: layout.nodes });
    const unseededEdges = sourceEdges.map(edge => ({ ...edge, data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data) }));
    const fallback = seedBaseReactFlowStagedLayoutEdges({ sourceEdges: unseededEdges, sourceNodes: layout.nodes });
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'repair-validate-or-route', requestId: 'lane-regression', nodes: absoluteNodes, edges: unseededEdges,
      fallbackCandidateEdges: fallback,
      candidateEdges: seed, candidateSource: 'persistent', enableSmartEdges: true,
      smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 0, qualityMode: 'full',
      inputIdentity: createDisplayRoutingIdentity('1234', `geometry-v1:${'a'.repeat(32)}`),
    });
    expect(response.hardReport, JSON.stringify(response.hardReport)).toMatchObject(cleanReport);
    expect(response.edges).toHaveLength(edges.length);
    expect(layout.nodes).toEqual(geometry);
  }, 30000);
});
