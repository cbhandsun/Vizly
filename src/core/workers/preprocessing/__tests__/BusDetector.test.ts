import { describe, expect, it } from 'vitest';
import type { Rectangle } from '../../../algorithms/geometryUtils';
import { Position, createDefaultRoutingConfig } from '../../../types/routing';
import { BusDetector } from '../BusDetector';

const config = createDefaultRoutingConfig();

const node = (
  id: string,
  x: number,
  y: number,
  width = 40,
  height = 40,
) => ({ id, x, y, position: { x, y }, width, height });

describe('BusDetector', () => {
  const detector = new BusDetector(config);

  it('falls back to the global direction when bus context is incomplete', () => {
    expect(detector.resolveBusOrientation(false, '', [], [], 'RL')).toEqual({
      busDir: 'RL',
      isHorz: true,
    });
    expect(detector.resolveBusOrientation(false, 'hub', null as never, [], 'TB')).toEqual({
      busDir: 'TB',
      isHorz: false,
    });
  });

  it('resolves bus orientation from weighted edge geometry', () => {
    const nodes = [
      node('hub', 0, 0),
      node('right-main', 200, 0),
      node('right-assoc', 260, 20),
      node('below', 0, 220),
    ];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edges = [
      { id: 'main', source: 'hub', target: 'right-main', type: 'main' },
      { id: 'assoc', source: 'hub', target: 'right-assoc', type: 'association' },
      { id: 'vertical', source: 'hub', target: 'below', type: 'association' },
    ];

    expect(detector.resolveBusOrientation(false, 'hub', edges, nodes, 'TB', nodeMap)).toEqual({
      busDir: 'LR',
      isHorz: true,
    });
    expect(detector.resolveBusOrientation(true, 'hub', [
      { id: 'incoming', source: 'below', target: 'hub', type: 'main' },
    ], nodes, 'LR', nodeMap)).toEqual({
      busDir: 'TB',
      isHorz: false,
    });
  });

  it('returns the global direction when horizontal and vertical votes tie', () => {
    const nodes = [node('hub', 0, 0), node('right', 200, 0), node('below', 0, 200)];
    const edges = [
      { id: 'right', source: 'hub', target: 'right', type: 'association' },
      { id: 'below', source: 'hub', target: 'below', type: 'association' },
    ];

    expect(detector.resolveBusOrientation(false, 'hub', edges, nodes, 'TB')).toEqual({
      busDir: 'TB',
      isHorz: false,
    });
  });

  it('detects edge quadrants around an origin node', () => {
    const nodes = [
      node('hub', 100, 100),
      node('right', 220, 110),
      node('left', 0, 100),
      node('bottom', 100, 240),
      node('top', 100, 0),
    ];
    const edges = [
      { id: 'r', source: 'hub', target: 'right' },
      { id: 'l', source: 'hub', target: 'left' },
      { id: 'b', source: 'hub', target: 'bottom' },
      { id: 't', source: 'top', target: 'hub' },
    ];

    expect(detector.getEdgeQuadrant('r', 'hub', true, nodes, edges)).toBe(0);
    expect(detector.getEdgeQuadrant('b', 'hub', true, nodes, edges)).toBe(1);
    expect(detector.getEdgeQuadrant('l', 'hub', true, nodes, edges)).toBe(2);
    expect(detector.getEdgeQuadrant('t', 'hub', false, nodes, edges)).toBe(3);
    expect(detector.getEdgeQuadrant('missing', 'hub', true, nodes, edges)).toBe(-1);
  });

  it('filters peer edges by the dominant quadrant and keeps the current edge', () => {
    const nodes = [
      node('hub', 0, 0),
      node('right-a', 160, 0),
      node('right-b', 180, 80),
      node('left', -160, 0),
      node('below', 0, 180),
    ];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const peers = [
      { id: 'current', source: 'hub', target: 'right-a' },
      { id: 'right-peer', source: 'hub', target: 'right-b' },
      { id: 'left-peer', source: 'hub', target: 'left' },
      { id: 'down-peer', source: 'hub', target: 'below' },
    ];

    expect(detector.filterPeersByQuadrant(
      peers,
      'hub',
      true,
      0,
      nodes,
      peers,
      'LR',
      'current',
      nodeMap,
    ).map((e) => e.id)).toEqual(['current', 'right-peer']);

    expect(detector.filterPeersByQuadrant(
      peers,
      'hub',
      true,
      -1,
      nodes,
      peers,
      'LR',
      'right-peer',
    ).map((e) => e.id)).toEqual(['right-peer']);
  });

  it('filters vertical peer groups upward or downward', () => {
    const nodes = [
      node('hub', 0, 0),
      node('below-a', 0, 180),
      node('below-b', 60, 220),
      node('above', 0, -180),
    ];
    const peers = [
      { id: 'current', source: 'hub', target: 'below-a' },
      { id: 'below-peer', source: 'hub', target: 'below-b' },
      { id: 'above-peer', source: 'hub', target: 'above' },
    ];

    expect(detector.filterPeersByQuadrant(
      peers,
      'hub',
      true,
      1,
      nodes,
      peers,
      'TB',
      'current',
    ).map((e) => e.id)).toEqual(['current', 'below-peer']);
  });

  it('sorts bus edges by signed distance around the hub', () => {
    const nodes = [
      node('hub', 0, 0),
      node('above', 100, -80),
      node('middle', 120, 20),
      node('below', 140, 120),
    ];
    const edges = [
      { id: 'below', source: 'hub', target: 'below' },
      { id: 'above', source: 'hub', target: 'above' },
      { id: 'middle', source: 'hub', target: 'middle' },
    ];

    expect(detector.sortEdges(edges, true, nodes, []).map((e) => e.id)).toEqual([
      'above',
      'middle',
      'below',
    ]);
  });

  it('returns explicit and empty bus consensus positions unchanged', () => {
    const hub: Rectangle = { x: 0, y: 0, width: 100, height: 60 };

    expect(detector.calculateBusConsensus(false, hub, [], [], null, [], Position.Left, true)).toEqual({
      position: Position.Left,
      hasFixed: true,
    });
    expect(detector.calculateBusConsensus(false, hub, [], [], null, [], Position.Right, false)).toEqual({
      position: Position.Right,
      hasFixed: false,
    });
    expect(detector.calculateBusConsensus(false, hub, [
      { id: 'missing', source: 'hub', target: 'missing' },
    ], [], null, [], Position.Bottom, false)).toEqual({
      position: Position.Bottom,
      hasFixed: false,
    });
  });

  it('chooses bus consensus ports from peer centroid and projection overlap', () => {
    const hub: Rectangle = { x: 0, y: 0, width: 100, height: 60 };
    const rightPeers = [
      node('right-a', 200, 0, 40, 30),
      node('right-b', 260, 20, 40, 30),
    ];
    const bottomPeers = [
      node('bottom-a', 20, 160, 40, 30),
      node('bottom-b', 60, 220, 40, 30),
    ];

    expect(detector.calculateBusConsensus(false, hub, [
      { id: 'ra', source: 'hub', target: 'right-a' },
      { id: 'rb', source: 'hub', target: 'right-b' },
    ], rightPeers, null, [], Position.Left, false)).toEqual({
      position: Position.Right,
      hasFixed: true,
    });

    expect(detector.calculateBusConsensus(false, hub, [
      { id: 'ba', source: 'hub', target: 'bottom-a' },
      { id: 'bb', source: 'hub', target: 'bottom-b' },
    ], bottomPeers, null, [], Position.Left, false)).toEqual({
      position: Position.Bottom,
      hasFixed: true,
    });
  });

  it('switches consensus to the alternate port when the primary side is crowded', () => {
    const hub: Rectangle = { x: 0, y: 0, width: 100, height: 60 };
    const peers = [node('right', 220, -10, 40, 30)];
    const obstacles: Rectangle[] = [
      { x: 110, y: 10, width: 10, height: 10 },
      { x: 125, y: 25, width: 10, height: 10 },
      { x: 140, y: 35, width: 10, height: 10 },
    ];

    expect(detector.calculateBusConsensus(false, hub, [
      { id: 'e', source: 'hub', target: 'right' },
    ], peers, null, obstacles, Position.Left, false)).toEqual({
      position: Position.Top,
      hasFixed: true,
    });
  });

  it('covers consensus slope, vertical-bias, and aspect-ratio fallbacks', () => {
    const squareHub: Rectangle = { x: 0, y: 0, width: 100, height: 100 };
    const wideHub: Rectangle = { x: 0, y: 0, width: 200, height: 100 };
    const tallHub: Rectangle = { x: 0, y: 0, width: 80, height: 160 };

    expect(detector.calculateBusConsensus(false, squareHub, [
      { id: 'prefer-vertical', source: 'hub', target: 'far-below' },
    ], [node('far-below', 170, 260, 40, 40)], null, [], Position.Left, false)).toEqual({
      position: Position.Bottom,
      hasFixed: true,
    });

    expect(detector.calculateBusConsensus(true, squareHub, [
      { id: 'slope-low', source: 'below', target: 'hub' },
    ], [node('below', 70, 240, 40, 40)], null, [], Position.Left, false)).toEqual({
      position: Position.Bottom,
      hasFixed: true,
    });

    expect(detector.calculateBusConsensus(true, wideHub, [
      { id: 'wide-aspect', source: 'diagonal', target: 'hub' },
    ], [node('diagonal', 250, 220, 40, 40)], null, [], Position.Left, false)).toEqual({
      position: Position.Bottom,
      hasFixed: true,
    });

    expect(detector.calculateBusConsensus(true, tallHub, [
      { id: 'tall-aspect', source: 'diagonal', target: 'hub' },
    ], [node('diagonal', 180, 220, 40, 40)], null, [], Position.Left, false)).toEqual({
      position: Position.Right,
      hasFixed: true,
    });

    expect(detector.calculateBusConsensus(true, squareHub, [
      { id: 'square-aspect', source: 'mostly-right', target: 'hub' },
    ], [node('mostly-right', 180, 150, 40, 40)], null, [], Position.Left, false)).toEqual({
      position: Position.Right,
      hasFixed: true,
    });
  });

  it('calculates adaptive bus separation with clamps and peer sizing', () => {
    expect(detector.calculateBusSeparation(null, 3, true)).toBe(config.bus.spacing);
    expect(detector.calculateBusSeparation({ x: 0, y: 0, width: 40, height: 40 }, 1, true)).toBe(config.bus.spacing);
    expect(detector.calculateBusSeparation({ x: 0, y: 0, width: 1200, height: 100 }, 3, true)).toBe(80);
    expect(detector.calculateBusSeparation(
      { x: 0, y: 0, width: 600, height: 80 },
      6,
      true,
      [
        { x: 0, y: 0, width: 30, height: 20 },
        { x: 0, y: 0, width: 30, height: 30 },
      ],
    )).toBe(20);
  });
});
