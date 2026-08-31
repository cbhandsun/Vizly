// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { routeDisplayReverseLayout } from '../baseReactFlowDisplayReverseLayoutRoute';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { clearDisplayRoutingWorkerSessions, readDisplayRoutingWorkerSession } from '../baseReactFlowDisplayWorkerSession';
import type { DisplayEdgesWorkerRepairValidateOrRouteRequest, DisplayEdgesWorkerRequest, DisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 400 }, measured: { width: 120, height: 80 }, data: {} },
  { id: 'target', position: { x: 0, y: 0 }, measured: { width: 120, height: 80 }, data: {} },
];
const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target', sourceHandle: 'top', targetHandle: 'bottom', data: { layoutDirection: 'BT' } }];
const request: DisplayEdgesWorkerRepairValidateOrRouteRequest = {
  operation: 'repair-validate-or-route', requestId: 'layout', nodes, edges,
  enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false, qualityMode: 'full', displayEdgeEpoch: 0,
  candidateSource: 'persistent', inputIdentity: createDisplayRoutingIdentity('123', `geometry-v1:${'a'.repeat(32)}`),
};
const canonical: Edge[] = [{ ...edges[0], sourceHandle: 'bottom', targetHandle: 'top',
  data: { layoutDirection: 'TB', computedPath: [{ x: 60, y: 80 }, { x: 60, y: 400 }] },
}];
type InternalRequest = Exclude<DisplayEdgesWorkerRequest, DisplayEdgesWorkerRepairValidateOrRouteRequest>;

describe('reverse layout transaction authority', () => {
  beforeEach(clearDisplayRoutingWorkerSessions);
  it('keeps the temporary frame identity-free and only validates the original frame for commit', () => {
    const compute = vi.fn<(input: InternalRequest) => DisplayEdgesWorkerResponse>()
      .mockReturnValueOnce({ requestId: 'layout', hardClean: true, edges: canonical, routeResolution: 'full-route' });
    const response = routeDisplayReverseLayout(request, edges, compute);
    expect(compute).toHaveBeenCalledOnce();
    const [working] = compute.mock.calls.map(([input]) => input);
    expect(working.operation).toBe('route');
    expect(working.inputIdentity).toBeUndefined();
    expect(working.nodes).not.toBe(nodes);
    expect(response?.routeResolution).toBe('full-route');
    expect(response?.commitReceipt?.identity).toEqual(request.inputIdentity);
    expect(response?.sessionRef?.identity).toEqual(request.inputIdentity);
    expect(response?.outputRouteSignature).toBe(response?.commitReceipt?.outputRouteSignature);
    if (!response?.edges) throw new Error('Missing restored result');
    expect(getExactDisplayHardReport(response.edges, nodes).hardClean).toBe(true);
    if (!request.inputIdentity || !response.outputRouteSignature) throw new Error('Missing commit identity');
    const session = readDisplayRoutingWorkerSession({ ref: response.sessionRef,
      expectedIdentity: request.inputIdentity, expectedOutputRouteSignature: response.outputRouteSignature });
    expect(session?.nodes).toEqual(request.nodes);
    expect(session?.sourceEdges).toEqual(request.edges);
  });

  it('does not try normalization for clean seeds or stop-after-obstacle transactions', () => {
    const compute = vi.fn();
    const clean = [{ ...edges[0], data: { computedPath: [{ x: 60, y: 400 }, { x: 60, y: 80 }] } }];
    expect(routeDisplayReverseLayout(request, clean, compute)).toBeNull();
    expect(routeDisplayReverseLayout({ ...request, stopAfterObstacleFailure: true }, edges, compute)).toBeNull();
    expect(compute).not.toHaveBeenCalled();
  });

  it('restores horizontal endpoints and non-square dimensions from the downward routing frame', () => {
    const horizontalNodes = nodes.map(node => ({ ...node,
      position: { x: node.position.y, y: node.position.x }, measured: { width: 80, height: 120 },
    }));
    const horizontalEdges = edges.map(edge => ({ ...edge, sourceHandle: 'left', targetHandle: 'right', data: { layoutDirection: 'RL' } }));
    const compute = vi.fn<(input: InternalRequest) => DisplayEdgesWorkerResponse>()
      .mockReturnValue({ requestId: 'layout', routeResolution: 'full-route', hardClean: true, edges: canonical });
    const response = routeDisplayReverseLayout({ ...request, nodes: horizontalNodes, edges: horizontalEdges }, horizontalEdges, compute);
    expect(compute.mock.calls[0][0].nodes[0].measured).toEqual({ width: 120, height: 80 });
    expect(response?.hardClean).toBe(true);
    expect(response?.edges?.[0]).toMatchObject({ sourceHandle: 'left', targetHandle: 'right', data: {
      layoutDirection: 'RL', computedPath: [{ x: 400, y: 60 }, { x: 80, y: 60 }],
    } });
    expect(horizontalNodes[0].measured).toEqual({ width: 80, height: 120 });
  });

  it.each([
    { hardClean: false, edges: canonical },
    { hardClean: true },
    { hardClean: true, edges: [] },
    { hardClean: true, edges: [{ ...canonical[0], source: 'wrong' }] },
    { hardClean: true, edges: [{ ...canonical[0], data: { computedPath: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } }] },
  ])('refuses authority for missing, mismatched or geometrically unsafe output %#', response => {
    const compute = vi.fn<(input: InternalRequest) => DisplayEdgesWorkerResponse>()
      .mockReturnValue({ requestId: 'layout', routeResolution: 'full-route', ...response });
    expect(routeDisplayReverseLayout(request, edges, compute)).toBeNull();
    expect(compute).toHaveBeenCalledOnce();
  });

  it('does not swallow a failed canonical computation', () => {
    const compute = vi.fn(() => { throw new Error('computation-failed'); });
    expect(() => routeDisplayReverseLayout(request, edges, compute)).toThrow('computation-failed');
  });

  it('preserves source-authored manual port constraints independently of geometric quality', () => {
    const compute = vi.fn<(input: InternalRequest) => DisplayEdgesWorkerResponse>()
      .mockReturnValue({ requestId: 'layout', routeResolution: 'full-route', hardClean: true, edges: canonical });
    const fixedEdges = edges.map(edge => ({ ...edge, sourceHandle: 'left', data: { ...edge.data, manualHandles: { source: true } } }));
    expect(routeDisplayReverseLayout({ ...request, edges: fixedEdges }, fixedEdges, compute)).toBeNull();
    const matchingEdges = edges.map(edge => ({ ...edge, data: { ...edge.data, manualHandles: { source: true, target: true } } }));
    const response = routeDisplayReverseLayout({ ...request, edges: matchingEdges }, matchingEdges, compute);
    expect(response?.hardClean).toBe(true);
    expect(response?.edges?.[0].sourceHandle).toBe('top');
    expect(response?.edges?.[0].targetHandle).toBe('bottom');
  });

  it.each([undefined, 'validated-candidate', 'incremental-route'] as const)('rejects non-full-route resolution %s', routeResolution => {
    const compute = vi.fn<(input: InternalRequest) => DisplayEdgesWorkerResponse>()
      .mockReturnValue({ requestId: 'layout', routeResolution, hardClean: true, edges: canonical });
    expect(routeDisplayReverseLayout(request, edges, compute)).toBeNull();
  });
});
