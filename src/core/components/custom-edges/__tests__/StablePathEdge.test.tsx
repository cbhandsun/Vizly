// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDisplayRoutingRenderAuthority } from '../../../routing/displayRoutingRenderAuthority';

import { StablePathEdge } from '../StablePathEdge';
import {
  createRoutingSessionEdgeRenderAdapter,
  STANDALONE_EDGE_RENDER_ADAPTER,
  SmartEdgeRoutingRenderAdapterContext,
  type SmartEdgeRoutingRenderAdapter,
} from '../smartEdgeRoutingRenderAdapter';

const renderAuthority = createDisplayRoutingRenderAuthority({
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:3:3:0123456789abcdef',
  hardReportDigest: 'hard-report-v1:0123456789abcdef',
  authorizedEdgeIds: ['edge-test', 'horizontal', 'vertical'],
});
if (!renderAuthority) throw new Error('expected valid routing render authority');
const ROUTING_SESSION_EDGE_RENDER_ADAPTER = createRoutingSessionEdgeRenderAdapter(
  renderAuthority,
);

const { useLineJumpsMock, reactFlowStoreMock } = vi.hoisted(() => ({
  useLineJumpsMock: vi.fn(() => ({ jumps: [], jumpPath: null })),
  reactFlowStoreMock: {
    edges: [],
    nodeLookup: new Map<string, unknown>(),
  },
}));

vi.mock('../hooks/useLineJumps', () => ({
  useLineJumps: useLineJumpsMock,
}));

vi.mock('@xyflow/react', async () => {
  const ReactModule = await import('react');
  return {
    BaseEdge: ({
      path,
      className,
      id,
      markerEnd,
      markerStart,
      interactionWidth,
      style,
    }: {
      path: string;
      className?: string;
      id?: string;
      markerEnd?: string;
      markerStart?: string;
      interactionWidth?: number;
      style?: React.CSSProperties;
    }) => ReactModule.createElement('path', {
      'data-testid': 'base-edge',
      'data-edge-id': id,
      d: path,
      className,
      markerEnd,
      markerStart,
      'data-interaction-width': interactionWidth,
      style,
    }),
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    useStore: (selector: (state: typeof reactFlowStoreMock) => unknown) => selector(reactFlowStoreMock),
  };
});

const createStablePathEdgeElement = (
  props: Record<string, unknown>,
  renderAdapter: SmartEdgeRoutingRenderAdapter = ROUTING_SESSION_EDGE_RENDER_ADAPTER,
) => (
    <SmartEdgeRoutingRenderAdapterContext.Provider value={renderAdapter}>
      <svg>
        <StablePathEdge
          id="edge-test"
          sourceX={0}
          sourceY={0}
          targetX={80}
          targetY={40}
          selected={false}
          sourcePosition={'right' as any}
          targetPosition={'left' as any}
          source="source"
          target="target"
          {...(props as any)}
        />
      </svg>
    </SmartEdgeRoutingRenderAdapterContext.Provider>
);

const renderStablePathEdge = (
  props: Record<string, unknown>,
  renderAdapter: SmartEdgeRoutingRenderAdapter = ROUTING_SESSION_EDGE_RENDER_ADAPTER,
) => render(createStablePathEdgeElement(props, renderAdapter));

describe('StablePathEdge', () => {
  beforeEach(() => {
    useLineJumpsMock.mockReset();
    useLineJumpsMock.mockReturnValue({ jumps: [], jumpPath: null });
    reactFlowStoreMock.nodeLookup.clear();
  });

  it('renders locked computed paths as strict M/L orthogonal SVG paths', () => {
    const { container } = renderStablePathEdge({
      sourceX: 10,
      sourceY: 20,
      targetX: 140,
      targetY: 96.4,
      data: {
        computedPath: [
          { x: 10, y: 20 },
          { x: 10.6, y: 96 },
          { x: 140, y: 96.4 },
        ],
      },
    });

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 10 20 L 10 96 L 140 96');
    expect(path.getAttribute('d')).not.toMatch(/[ACQ]/);
    expect(path.getAttribute('data-interaction-width')).toBe('0');
    expect(path.style.pointerEvents).toBe('none');
    expect(container.querySelectorAll('.react-flow__edge-interaction')).toHaveLength(1);
  });

  it('fails closed on standalone computed paths without Routing Session authority', () => {
    renderStablePathEdge({
      sourceX: 0,
      sourceY: 0,
      targetX: 80,
      targetY: 40,
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 0, y: 200 },
          { x: 80, y: 200 },
          { x: 80, y: 40 },
        ],
      },
    }, STANDALONE_EDGE_RENDER_ADAPTER);

    expect(screen.getByTestId('base-edge').getAttribute('d')).not.toContain('200');
  });

  it('snaps small rendered endpoint drift back onto the dominant orthogonal axis', () => {
    renderStablePathEdge({
      sourceX: 13,
      sourceY: 476,
      targetX: 16.0055,
      targetY: 636.014,
      data: {
        computedPath: [
          { x: 13, y: 476 },
          { x: 16.0055, y: 636.014 },
        ],
      },
    });

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 13 476 L 13 636.014');
  });

  it('uses live endpoints when a node moves away from a precomputed path', () => {
    renderStablePathEdge({
      sourceX: 50,
      sourceY: 60,
      targetX: 130,
      targetY: 100,
      sourcePosition: 'bottom',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 80, y: 40 },
        ],
      },
    });

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 50 60 L 50 100 L 130 100');
  });

  it('preserves canvas-owned final paths when routed anchors differ from live handles', () => {
    renderStablePathEdge({
      sourceX: 1068.95,
      sourceY: 651.7,
      targetX: 1071.95,
      targetY: 814.2,
      sourcePosition: 'bottom',
      targetPosition: 'top',
      data: {
        computedPath: [
          { x: 1065, y: 652 },
          { x: 1065, y: 812 },
        ],
      },
    }, ROUTING_SESSION_EDGE_RENDER_ADAPTER);

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 1065 652 L 1065 812');
  });

  it('preserves a worker-distributed terminal lane instead of drawing through a sibling node', () => {
    reactFlowStoreMock.nodeLookup.set('source', {
      internals: { positionAbsolute: { x: 616, y: 1700 } },
      measured: { width: 249, height: 96 },
    });
    reactFlowStoreMock.nodeLookup.set('target', {
      internals: { positionAbsolute: { x: 633, y: 2212 } },
      measured: { width: 216, height: 96 },
    });
    renderStablePathEdge({
      sourceX: 744.7,
      sourceY: 1795.86,
      targetX: 748.19,
      targetY: 2214.03,
      sourcePosition: 'bottom',
      targetPosition: 'top',
      data: {
        computedPath: [
          { x: 741, y: 1796 },
          { x: 741, y: 1908 },
          { x: 616, y: 1908 },
          { x: 616, y: 2140 },
          { x: 645, y: 2140 },
          { x: 645, y: 2212 },
        ],
      },
    });

    expect(screen.getByTestId('base-edge').getAttribute('d'))
      .toBe('M 741 1796 L 741 1908 L 616 1908 L 616 2140 L 645 2140 L 645 2212');
  });

  it('rechecks unchanged layout paths after React Flow refreshes absolute node geometry', () => {
    const computedPath = [
      { x: 100, y: 96 },
      { x: 260, y: 96 },
    ];
    const props = {
      sourceX: -1272,
      sourceY: 1024.5,
      targetX: -1292,
      targetY: 1024.5,
      sourcePosition: 'right',
      targetPosition: 'left',
      data: { computedPath, _layoutEpoch: 1 },
    };
    const { rerender } = renderStablePathEdge(props);

    expect(screen.getByTestId('base-edge').getAttribute('d'))
      .toBe('M -1272 1024.5 L -1292 1024.5');

    reactFlowStoreMock.nodeLookup.set('source', {
      internals: { positionAbsolute: { x: 0, y: 48 } },
      measured: { width: 100, height: 96 },
    });
    reactFlowStoreMock.nodeLookup.set('target', {
      internals: { positionAbsolute: { x: 260, y: 48 } },
      measured: { width: 100, height: 96 },
    });
    rerender(createStablePathEdgeElement({
      ...props,
      data: { computedPath, _layoutEpoch: 2 },
    }));

    expect(screen.getByTestId('base-edge').getAttribute('d'))
      .toBe('M 100 96 L 260 96');
  });

  it('rejects a canvas-owned path after a layout moves both live endpoints', () => {
    renderStablePathEdge({
      sourceX: 500,
      sourceY: 600,
      targetX: 700,
      targetY: 760,
      sourcePosition: 'bottom',
      targetPosition: 'top',
      data: {
        computedPath: [
          { x: 10, y: 20 },
          { x: 10, y: 180 },
        ],
      },
    });

    expect(screen.getByTestId('base-edge').getAttribute('d'))
      .toBe('M 500 600 L 500 760 L 700 760');
  });

  it('uses an orthogonal M/L fallback instead of React Flow smoothstep curves', () => {
    renderStablePathEdge({
      sourceX: 10,
      sourceY: 20,
      targetX: 140,
      targetY: 96,
      sourcePosition: 'bottom',
      data: {},
    });

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 10 20 L 10 96 L 140 96');
    expect(path.getAttribute('d')).not.toMatch(/[ACQ]/);
  });

  it('renders a deterministic line jump supplied by the stable-edge crossing registry', () => {
    useLineJumpsMock.mockImplementation(({ edgeId }: { edgeId: string }) => edgeId === 'horizontal'
      ? {
        jumps: [{
          point: { x: 80, y: 40 },
          horizontalEdgeId: 'horizontal',
          verticalEdgeId: 'vertical',
        }],
        jumpPath: 'M 0 40 L 74 40 A 6 6 0 0 1 86 40 L 160 40',
      }
      : { jumps: [], jumpPath: null });
    const stableEdge = (
      id: string,
      source: string,
      target: string,
      points: Array<{ x: number; y: number }>,
    ) => (
      <StablePathEdge
        id={id}
        sourceX={points[0].x}
        sourceY={points[0].y}
        targetX={points.at(-1)?.x ?? 0}
        targetY={points.at(-1)?.y ?? 0}
        selected={false}
        sourcePosition={'right' as any}
        targetPosition={'left' as any}
        source={source}
        target={target}
        data={{ computedPath: points }}
      />
    );
    const { container } = render(
      <SmartEdgeRoutingRenderAdapterContext.Provider value={ROUTING_SESSION_EDGE_RENDER_ADAPTER}>
        <svg>
          {stableEdge('horizontal', 'left', 'right', [{ x: 0, y: 40 }, { x: 160, y: 40 }])}
          {stableEdge('vertical', 'top', 'bottom', [{ x: 80, y: 0 }, { x: 80, y: 100 }])}
        </svg>
      </SmartEdgeRoutingRenderAdapterContext.Provider>,
    );

    const horizontal = container.querySelector('[data-edge-id="horizontal"]');
    expect(horizontal?.getAttribute('d')).toContain('A 6 6');
    expect(container.querySelector('[data-line-jump-count="1"]')).not.toBeNull();
    expect(container.querySelector('[data-edge-id="vertical"]')?.getAttribute('d')).not.toContain('A 6 6');
  });

  it('keeps ordinary detail labels quiet until a route trace is active', () => {
    renderStablePathEdge({
      label: 'Detail route',
      style: { strokeWidth: 2 },
    });

    const label = screen.getByText('Detail route');
    expect(label.getAttribute('data-edge-id')).toBe('edge-test');
    expect(label.getAttribute('data-edge-label-priority')).toBe('detail');
    expect(label.getAttribute('data-edge-trace-state')).toBe('idle');
    expect(label.classList.contains('stable-path-edge-label--trace-active')).toBe(false);
    expect(label.getAttribute('tabindex')).toBe('-1');
  });

  it('marks semantic main-route and selected labels for low-zoom restoration', () => {
    renderStablePathEdge({
      label: 'Main route',
      selected: true,
      style: { strokeWidth: 3 },
    });

    const label = screen.getByText('Main route');
    expect(label.classList.contains('stable-path-edge-label--primary')).toBe(true);
    expect(label.classList.contains('stable-path-edge-label--trace-active')).toBe(true);
    expect(label.getAttribute('data-edge-trace-state')).toBe('active');
    expect(label.getAttribute('tabindex')).toBe('0');
  });

  it('synchronizes pointer and keyboard focus state with the rendered label', () => {
    const { container } = renderStablePathEdge({ label: 'Focusable route' });

    const label = screen.getByText('Focusable route');
    const path = screen.getByTestId('base-edge');

    fireEvent.pointerEnter(path);
    expect(label.classList.contains('stable-path-edge-label--trace-active')).toBe(true);
    expect(container.querySelectorAll('.stable-path-edge-terminal')).toHaveLength(2);
    expect(container.querySelector('[data-edge-terminal="source"]')).not.toBeNull();
    expect(container.querySelector('[data-edge-terminal="target"]')).not.toBeNull();
    fireEvent.pointerLeave(path);
    expect(label.classList.contains('stable-path-edge-label--trace-active')).toBe(false);
    expect(container.querySelectorAll('.stable-path-edge-terminal')).toHaveLength(0);

    fireEvent.focus(label);
    expect(label.classList.contains('stable-path-edge-label--trace-active')).toBe(true);
    expect(container.querySelectorAll('.stable-path-edge-terminal')).toHaveLength(2);
    fireEvent.blur(label);
    expect(label.classList.contains('stable-path-edge-label--trace-active')).toBe(false);
    expect(container.querySelectorAll('.stable-path-edge-terminal')).toHaveLength(0);
  });

  it('does not repaint a fully hidden shared trunk through the contrast underlay', () => {
    const { container } = renderStablePathEdge({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 0,
      style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
      markerEnd: 'url(#cyan-arrow)',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{
            from: 0,
            to: 100,
            role: 'target',
            ownerEdgeId: 'owner-edge',
          }],
          memberships: [],
          backboneRanges: [],
        },
      },
    }, ROUTING_SESSION_EDGE_RENDER_ADAPTER);

    const preparedTrace = container.querySelector('.shared-trunk-accent-trace');
    expect(preparedTrace?.getAttribute('style')).toContain('opacity: 0');
    expect([...container.querySelectorAll('[data-testid="base-edge"]')]
      .filter(path => !path.classList.contains('shared-trunk-accent-trace'))).toHaveLength(0);
    expect(container.querySelector('.vizly-edge-contrast-underlay')).toBeNull();
    expect(container.querySelector('.shared-trunk-edge-interaction')).not.toBeNull();
  });

  it('paints one mixed-semantic canonical backbone and keeps the label on the visible branch', () => {
    const membership = {
      id: 'source:source:edge-test',
      role: 'source',
      endpointId: 'source',
      ownerEdgeId: 'edge-test',
      edgeIds: ['edge-member', 'edge-test'],
      commonLength: 100,
    } as const;
    const { container } = renderStablePathEdge({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 0,
      label: 'Canonical branch label',
      markerStart: 'url(#semantic-start)',
      markerEnd: 'url(#semantic-end)',
      style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{ from: 0, to: 100, role: 'source', ownerEdgeId: 'edge-test' }],
          memberships: [membership],
          backboneRanges: [{
            from: 0,
            to: 100,
            role: 'source',
            ownerEdgeId: 'edge-test',
            membershipId: membership.id,
            paint: {
              token: 'mixed-neutral',
              stroke: '#64748B',
              strokeWidth: 3,
              strokeDasharray: '',
              opacity: 0.92,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
          }],
        },
      },
    }, ROUTING_SESSION_EDGE_RENDER_ADAPTER);

    const backbone = container.querySelector('.shared-trunk-canonical-backbone');
    expect(backbone?.getAttribute('d')).toBe('M 0 0 L 100 0');
    expect(backbone?.getAttribute('style')).toContain('stroke: rgb(100, 116, 139)');
    expect(backbone?.getAttribute('style')).toContain('stroke-width: 3');
    expect(backbone?.getAttribute('marker-start')).toBeNull();
    expect(backbone?.getAttribute('marker-end')).toBeNull();
    const junction = container.querySelector('.shared-trunk-junction');
    expect(junction?.getAttribute('d')).toBe('M 99.99 0 L 100.01 0');
    expect(junction?.getAttribute('style')).toContain('stroke-width: 5');
    expect(junction?.getAttribute('marker-start')).toBeNull();
    expect(junction?.getAttribute('marker-end')).toBeNull();
    expect(container.querySelector('[data-shared-trunk-junction-fragments="1"]')).not.toBeNull();

    const semantic = container.querySelector('.shared-trunk-semantic-fragment');
    expect(semantic?.getAttribute('d')).toBe('M 100 0 L 200 0');
    expect(semantic?.getAttribute('marker-start')).toBeNull();
    expect(semantic?.getAttribute('marker-end')).toBe('url(#semantic-end)');
    const sourceMarkerCarrier = container.querySelector('.shared-trunk-terminal-marker-carrier');
    expect(sourceMarkerCarrier?.getAttribute('marker-start')).toBe('url(#semantic-start)');
    expect(sourceMarkerCarrier?.getAttribute('marker-end')).toBeNull();
    expect(sourceMarkerCarrier?.getAttribute('style')).toContain('stroke: transparent');
    expect(sourceMarkerCarrier?.getAttribute('data-interaction-width')).toBeNull();
    expect(sourceMarkerCarrier?.classList.contains('vizly-edge-contrast-marker-outline--dark')).toBe(true);
    expect(sourceMarkerCarrier?.getAttribute('style'))
      .toContain('--vizly-edge-marker-outline-color: #334155');
    expect(Number(sourceMarkerCarrier?.parentElement?.getAttribute('data-edge-contrast-underlay-ratio')))
      .toBeGreaterThanOrEqual(3);
    expect(sourceMarkerCarrier?.parentElement?.querySelectorAll('path')).toHaveLength(1);
    expect(sourceMarkerCarrier?.parentElement?.querySelector('.react-flow__edge-interaction')).toBeNull();
    expect(sourceMarkerCarrier?.parentElement?.getAttribute('data-shared-trunk-marker-paint')).toBe('owner-fallback');
    expect(screen.getByText('Canonical branch label').style.transform).toContain('translate(150px,');
    expect(container.querySelector('.shared-trunk-accent-trace')?.getAttribute('style')).toContain('opacity: 0');
  });

  it('keeps a same-semantic canonical backbone in the normalized semantic paint', () => {
    const membership = {
      id: 'target:target:edge-test',
      role: 'target',
      endpointId: 'target',
      ownerEdgeId: 'edge-test',
      edgeIds: ['edge-member', 'edge-test'],
      commonLength: 80,
    } as const;
    const { container } = renderStablePathEdge({
      sourceX: 0,
      sourceY: 0,
      targetX: 160,
      targetY: 0,
      style: { stroke: '#FF5722', strokeWidth: 3 },
      markerEnd: 'url(#orange-arrow)',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 160, y: 0 }],
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{ from: 80, to: 160, role: 'target', ownerEdgeId: 'edge-test' }],
          memberships: [membership],
          backboneRanges: [{
            from: 80,
            to: 160,
            role: 'target',
            ownerEdgeId: 'edge-test',
            membershipId: membership.id,
            paint: {
              token: 'semantic',
              stroke: '#FF5722',
              strokeWidth: 3,
              strokeDasharray: '',
              opacity: 1,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
          }],
        },
      },
    }, ROUTING_SESSION_EDGE_RENDER_ADAPTER);

    const backbone = container.querySelector('.shared-trunk-canonical-backbone');
    expect(backbone?.getAttribute('d')).toBe('M 80 0 L 160 0');
    expect(backbone?.getAttribute('style')).toContain('stroke: rgb(255, 87, 34)');
    expect(backbone?.getAttribute('style')).toContain('stroke-width: 3');
    const targetMarkerCarrier = container.querySelector('.shared-trunk-terminal-marker-carrier');
    expect(targetMarkerCarrier?.getAttribute('marker-start')).toBeNull();
    expect(targetMarkerCarrier?.getAttribute('marker-end')).toBe('url(#orange-arrow)');
    expect(targetMarkerCarrier?.className.baseVal).not.toContain('vizly-edge-contrast-marker-outline');
    expect(targetMarkerCarrier?.parentElement?.getAttribute('data-edge-contrast')).toBe('sufficient');
  });

  it('keeps selected canonical paint immutable and highlights only with one markerless full trace', () => {
    const membership = {
      id: 'source:source:edge-test',
      role: 'source',
      endpointId: 'source',
      ownerEdgeId: 'edge-test',
      edgeIds: ['edge-member', 'edge-test'],
      commonLength: 60,
    } as const;
    const { container } = renderStablePathEdge({
      sourceX: 0,
      sourceY: 0,
      targetX: 120,
      targetY: 0,
      selected: true,
      style: { stroke: '#47CACC', strokeWidth: 2, opacity: 0.86 },
      markerEnd: 'url(#semantic-end)',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 120, y: 0 }],
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{ from: 0, to: 60, role: 'source', ownerEdgeId: 'edge-test' }],
          memberships: [membership],
          backboneRanges: [{
            from: 0,
            to: 60,
            role: 'source',
            ownerEdgeId: 'edge-test',
            membershipId: membership.id,
            paint: {
              token: 'mixed-neutral',
              stroke: '#64748B',
              strokeWidth: 3,
              strokeDasharray: '',
              opacity: 0.92,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
          }],
        },
      },
    }, ROUTING_SESSION_EDGE_RENDER_ADAPTER);

    const backbone = container.querySelector('.shared-trunk-canonical-backbone');
    expect(backbone?.getAttribute('style')).toContain('--vizly-shared-canonical-stroke: #64748B');
    expect(backbone?.getAttribute('style')).toContain('--vizly-shared-canonical-opacity: 0.92');
    const trace = container.querySelector('.shared-trunk-accent-trace');
    expect(trace?.getAttribute('d')).toBe('M 0 0 L 120 0');
    expect(trace?.getAttribute('style')).toContain('opacity: 1');
    expect(trace?.getAttribute('marker-start')).toBeNull();
    expect(trace?.getAttribute('marker-end')).toBeNull();
  });

  it('uses one full active trace across dual-role ranges and suppresses the idle backbone label', () => {
    const sharedPlan = {
      hiddenRanges: [
        { from: 0, to: 70, role: 'source', ownerEdgeId: 'source-owner' },
        { from: 50, to: 120, role: 'target', ownerEdgeId: 'target-owner' },
      ],
      memberships: [],
      backboneRanges: [],
    };
    const idle = renderStablePathEdge({
      sourceX: 0,
      sourceY: 0,
      targetX: 120,
      targetY: 0,
      label: 'Fully canonical bridge',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 120, y: 0 }],
        __vizlySharedTrunkPaint: sharedPlan,
      },
    }, ROUTING_SESSION_EDGE_RENDER_ADAPTER);

    expect(screen.queryByText('Fully canonical bridge')).toBeNull();
    expect(idle.container.querySelector('.shared-trunk-accent-trace')?.getAttribute('style'))
      .toContain('opacity: 0');
    idle.unmount();

    const active = renderStablePathEdge({
      sourceX: 0,
      sourceY: 0,
      targetX: 120,
      targetY: 0,
      selected: true,
      label: 'Fully canonical bridge',
      markerStart: 'url(#start)',
      markerEnd: 'url(#end)',
      style: { stroke: '#2563EB', strokeWidth: 2 },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 120, y: 0 }],
        __vizlySharedTrunkPaint: sharedPlan,
      },
    }, ROUTING_SESSION_EDGE_RENDER_ADAPTER);

    const traces = active.container.querySelectorAll('.shared-trunk-accent-trace');
    expect(traces).toHaveLength(1);
    expect([...traces].map(trace => trace.getAttribute('d'))).toEqual([
      'M 0 0 L 120 0',
    ]);
    for (const trace of traces) {
      expect(trace.getAttribute('style')).toContain('stroke: rgb(37, 99, 235)');
      expect(trace.getAttribute('style')).toContain('stroke-width: 3.5');
      expect(trace.getAttribute('style')).toContain('opacity: 1');
      expect(trace.getAttribute('marker-start')).toBeNull();
      expect(trace.getAttribute('marker-end')).toBeNull();
    }
    expect(screen.getByText('Fully canonical bridge').getAttribute('data-edge-trace-state')).toBe('active');
  });
});
