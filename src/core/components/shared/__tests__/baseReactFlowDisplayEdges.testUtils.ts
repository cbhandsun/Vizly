import type { Edge, Node } from '@xyflow/react';
import { vi } from 'vitest';

vi.hoisted(() => {
  if (typeof HTMLCanvasElement === 'undefined') return;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text || '').length * 8 }),
    }),
  });
});

export const baseNodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 200 },
    data: { layoutDirection: 'TB' },
    measured: { width: 100, height: 60 },
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    data: {},
    measured: { width: 100, height: 60 },
  },
];

export function node(id: string, x: number, y: number, width: number, height: number): Node {
  return {
    id,
    position: { x, y },
    data: {},
    measured: { width, height },
  };
}

export function lockedEdge(
  id: string,
  source: string,
  target: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge {
  return {
    id,
    source,
    target,
    type: 'advanced-smart-step',
    data: {
      computedPath,
      layoutPathLocked: true,
      layoutDirection: 'TB',
    },
  };
}

export function withAbsoluteNodePositions(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map(nodeItem => [nodeItem.id, nodeItem] as const));
  const resolve = (nodeItem: Node, seen = new Set<string>()): { x: number; y: number } => {
    const pos = (nodeItem as any).positionAbsolute ?? nodeItem.position ?? { x: 0, y: 0 };
    const x = Number((pos as any).x || 0);
    const y = Number((pos as any).y || 0);
    const parentId = (nodeItem as any).parentId;
    if ((nodeItem as any).positionAbsolute || !parentId || seen.has(parentId)) return { x, y };
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return { x, y };
    const parentPos = resolve(parent, seen);
    return { x: x + parentPos.x, y: y + parentPos.y };
  };
  return nodes.map(nodeItem => ({ ...nodeItem, positionAbsolute: resolve(nodeItem) }) as Node);
}

export function edgeNodeObstacleHits(
  edges: Edge[],
  nodes: Node[],
): Array<{
  edgeId: string;
  nodeId: string;
  segmentIndex: number;
  segment: Array<{ x: number; y: number }>;
  rect: { x: number; y: number; width: number; height: number };
}> {
  const obstacles = nodes
    .filter(nodeItem => !isObstacleContainerNode(nodeItem))
    .map(nodeItem => ({ node: nodeItem, rect: rectForObstacleNode(nodeItem) }))
    .filter((item): item is {
      node: Node;
      rect: { x: number; y: number; width: number; height: number };
    } => Boolean(item.rect));
  return edges.flatMap((edge) => {
    const path = (((edge.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>)
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (path.length < 2) return [];
    return path.slice(0, -1).flatMap((point, segmentIndex) => (
      obstacles
        .filter(({ node: nodeItem, rect }) => (
          nodeItem.id === edge.source || nodeItem.id === edge.target
            ? segmentIntersectsNodeInterior(point, path[segmentIndex + 1], rect)
            : segmentIntersectsObstacleRect(point, path[segmentIndex + 1], rect)
        ))
        .map(({ node: nodeItem, rect }) => ({
          edgeId: edge.id,
          nodeId: nodeItem.id,
          segmentIndex,
          segment: [point, path[segmentIndex + 1]],
          rect,
        }))
    ));
  });
}

export function detachedDisplayEndpoints(
  edges: Edge[],
  nodes: Node[],
): Array<{
  edgeId: string;
  terminal: 'source' | 'target';
  nodeId: string;
  point: { x: number; y: number };
  rect: { x: number; y: number; width: number; height: number };
}> {
  const nodeById = new Map(nodes.map(nodeItem => [nodeItem.id, nodeItem] as const));
  const tolerance = 0.51;
  const touchesBoundary = (
    point: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number },
  ): boolean => {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    return (
      (Math.abs(point.x - left) <= tolerance || Math.abs(point.x - right) <= tolerance)
        && point.y >= top - tolerance
        && point.y <= bottom + tolerance
    ) || (
      (Math.abs(point.y - top) <= tolerance || Math.abs(point.y - bottom) <= tolerance)
        && point.x >= left - tolerance
        && point.x <= right + tolerance
    );
  };

  return edges.flatMap((edge) => {
    const path = ((edge.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;
    if (path.length < 2) return [];
    return ([
      { terminal: 'source' as const, nodeId: edge.source, point: path[0] },
      { terminal: 'target' as const, nodeId: edge.target, point: path[path.length - 1] },
    ]).flatMap(({ terminal, nodeId, point }) => {
      const nodeItem = nodeById.get(nodeId);
      const rect = nodeItem ? rectForObstacleNode(nodeItem) : null;
      if (!rect || touchesBoundary(point, rect)) return [];
      return [{ edgeId: edge.id, terminal, nodeId, point, rect }];
    });
  });
}

function isObstacleContainerNode(nodeItem: Node): boolean {
  return new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])
    .has(String(nodeItem.type ?? ''));
}

export function rectForObstacleNode(nodeItem: Node): { x: number; y: number; width: number; height: number } | null {
  const position = (nodeItem as any).positionAbsolute ?? nodeItem.position ?? { x: 0, y: 0 };
  const width = finiteNumber((nodeItem as any).measured?.width ?? nodeItem.width ?? (nodeItem.style as any)?.width);
  const height = finiteNumber((nodeItem as any).measured?.height ?? nodeItem.height ?? (nodeItem.style as any)?.height);
  if (width <= 1 || height <= 1) return null;
  return {
    x: finiteNumber((position as any).x),
    y: finiteNumber((position as any).y),
    width,
    height,
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function segmentIntersectsObstacleRect(
  first: { x: number; y: number },
  second: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const padding = 8;
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  if (Math.abs(first.y - second.y) <= 1) {
    const y = first.y;
    if (y <= top || y >= bottom) return false;
    return Math.max(Math.min(first.x, second.x), left) < Math.min(Math.max(first.x, second.x), right);
  }
  if (Math.abs(first.x - second.x) <= 1) {
    const x = first.x;
    if (x <= left || x >= right) return false;
    return Math.max(Math.min(first.y, second.y), top) < Math.min(Math.max(first.y, second.y), bottom);
  }
  return false;
}

function segmentIntersectsNodeInterior(
  first: { x: number; y: number },
  second: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const tolerance = 0.51;
  const left = rect.x + tolerance;
  const right = rect.x + rect.width - tolerance;
  const top = rect.y + tolerance;
  const bottom = rect.y + rect.height - tolerance;
  if (Math.abs(first.y - second.y) <= 1) {
    const y = first.y;
    if (y <= top || y >= bottom) return false;
    return Math.max(Math.min(first.x, second.x), left) < Math.min(Math.max(first.x, second.x), right);
  }
  if (Math.abs(first.x - second.x) <= 1) {
    const x = first.x;
    if (x <= left || x >= right) return false;
    return Math.max(Math.min(first.y, second.y), top) < Math.min(Math.max(first.y, second.y), bottom);
  }
  return false;
}

export function renderedSystemsInteractionDisplayEdges(): Edge[] {
  const paths: Array<[string, string, string, Array<{ x: number; y: number }>]> = [
    ['edge-carrier-customer', 'carrier-partner', 'customer', [{ x: 324.76625, y: 3752 }, { x: 324.76625, y: 3910 }]],
    ['edge-master-data-oms-order', 'master-data', 'oms-order', [{ x: 310, y: 746 }, { x: 310, y: 842 }, { x: 315, y: 842 }, { x: 315, y: 976 }]],
    ['edge-master-data-tms-planning', 'master-data', 'tms-planning', [{ x: 310, y: 746 }, { x: 310, y: 842 }, { x: 514, y: 842 }, { x: 514, y: 2710 }, { x: 310, y: 2710 }, { x: 310, y: 2806 }]],
    ['edge-master-data-wms-inventory', 'master-data', 'wms-inventory', [{ x: 310, y: 746 }, { x: 310, y: 842 }, { x: 512, y: 842 }, { x: 512, y: 2040 }, { x: 334, y: 2040 }, { x: 334, y: 2170 }]],
    ['edge-oms-atc-fulfill', 'oms-atc', 'oms-fulfill', [{ x: 210, y: 1454 }, { x: 210, y: 1528 }, { x: 314, y: 1528 }, { x: 314, y: 1612 }]],
    ['edge-oms-fulfill-wms-outbound', 'oms-fulfill', 'wms-outbound', [{ x: 338, y: 1772 }, { x: 338, y: 2040 }, { x: 490, y: 2040 }, { x: 490, y: 2393 }, { x: 310, y: 2393 }, { x: 310, y: 2489 }]],
    ['edge-oms-order-atc', 'oms-order', 'oms-atc', [{ x: 369, y: 1136 }, { x: 369, y: 1295 }]],
    ['edge-sales-oms-order', 'sales-channels', 'oms-order', [{ x: 317, y: 200 }, { x: 317, y: 289 }, { x: 88, y: 289 }, { x: 88, y: 880 }, { x: 315, y: 880 }, { x: 315, y: 976 }]],
    ['edge-tms-execution-carrier', 'tms-execution', 'carrier-partner', [{ x: 310, y: 3284 }, { x: 310, y: 3683 }]],
    ['edge-tms-execution-oms-order', 'tms-execution', 'oms-order', [{ x: 310, y: 3124 }, { x: 310, y: 3028 }, { x: 105, y: 3028 }, { x: 105, y: 1232 }, { x: 314, y: 1232 }, { x: 314, y: 1136 }]],
    ['edge-tms-execution-wms-outbound', 'tms-execution', 'wms-outbound', [{ x: 310, y: 3124 }, { x: 310, y: 3016 }, { x: 129, y: 3016 }, { x: 129, y: 2744 }, { x: 214, y: 2744 }, { x: 214, y: 2648 }]],
    ['edge-tms-planning-execution', 'tms-planning', 'tms-execution', [{ x: 334, y: 2966 }, { x: 334, y: 3124 }]],
    ['edge-wms-inventory-oms-atc', 'wms-inventory', 'oms-atc', [{ x: 310, y: 2329 }, { x: 310, y: 2415 }, { x: 142, y: 2415 }, { x: 142, y: 1550 }, { x: 314, y: 1550 }, { x: 314, y: 1454 }]],
    ['edge-wms-inventory-outbound', 'wms-inventory', 'wms-outbound', [{ x: 310, y: 2330 }, { x: 310, y: 2392 }, { x: 326, y: 2392 }, { x: 326, y: 2488 }]],
    ['edge-wms-outbound-oms-fulfill', 'wms-outbound', 'oms-fulfill', [{ x: 139, y: 2488 }, { x: 139, y: 2148 }, { x: 296, y: 2148 }, { x: 296, y: 1914 }, { x: 314, y: 1914 }, { x: 314, y: 1772 }]],
    ['edge-wms-outbound-tms-planning', 'wms-outbound', 'tms-planning', [{ x: 366, y: 2648 }, { x: 366, y: 2710 }, { x: 310, y: 2710 }, { x: 310, y: 2806 }]],
  ];

  return paths.map(([id, source, target, computedPath]) => ({
    id,
    source,
    target,
    type: 'advanced-smart-step',
    data: {
      computedPath,
      layoutPathLocked: true,
      layoutDirection: 'TB',
    },
  }));
}

export function maxParallelOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): number {
  let maxOverlap = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
    }
  }
  return maxOverlap;
}

export function maxOppositeDirectionOverlap(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
): number {
  let maxOverlap = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentDirection(a[i], a[i + 1]) * segmentDirection(b[j], b[j + 1]) >= 0) continue;
      maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
    }
  }
  return maxOverlap;
}

export function edgeOverlapProblems(edges: Edge[]): Array<{
  first: string;
  second: string;
  reverseOverlap: number;
  unrelatedOverlap: number;
  firstPath: Array<{ x: number; y: number }>;
  secondPath: Array<{ x: number; y: number }>;
}> {
  const paths = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    path: ((edge.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>,
  }));
  const problems: Array<{
    first: string;
    second: string;
    reverseOverlap: number;
    unrelatedOverlap: number;
    firstPath: Array<{ x: number; y: number }>;
    secondPath: Array<{ x: number; y: number }>;
  }> = [];
  for (let firstIndex = 0; firstIndex < paths.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex += 1) {
      let reverseOverlap = 0;
      let unrelatedOverlap = 0;
      for (let i = 0; i < paths[firstIndex].path.length - 1; i += 1) {
        for (let j = 0; j < paths[secondIndex].path.length - 1; j += 1) {
          const overlap = segmentOverlap(
            paths[firstIndex].path[i],
            paths[firstIndex].path[i + 1],
            paths[secondIndex].path[j],
            paths[secondIndex].path[j + 1],
          );
          if (overlap < 16) continue;
          const firstDirection = segmentDirection(paths[firstIndex].path[i], paths[firstIndex].path[i + 1]);
          const secondDirection = segmentDirection(paths[secondIndex].path[j], paths[secondIndex].path[j + 1]);
          if (firstDirection !== 0 && firstDirection === -secondDirection) reverseOverlap += Math.round(overlap);
          const related = paths[firstIndex].source === paths[secondIndex].source
            || paths[firstIndex].source === paths[secondIndex].target
            || paths[firstIndex].target === paths[secondIndex].source
            || paths[firstIndex].target === paths[secondIndex].target;
          if (!related) unrelatedOverlap += Math.round(overlap);
        }
      }
      if (reverseOverlap || unrelatedOverlap) {
        problems.push({
          first: paths[firstIndex].id,
          second: paths[secondIndex].id,
          reverseOverlap,
          unrelatedOverlap,
          firstPath: paths[firstIndex].path,
          secondPath: paths[secondIndex].path,
        });
      }
    }
  }
  return problems.sort((first, second) => (
    second.reverseOverlap - first.reverseOverlap
    || second.unrelatedOverlap - first.unrelatedOverlap
  ));
}

function segmentDirection(a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (Math.abs(a.x - b.x) < 1) return Math.sign(b.y - a.y);
  if (Math.abs(a.y - b.y) < 1) return Math.sign(b.x - a.x);
  return 0;
}

function segmentOverlap(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): number {
  const aVertical = Math.abs(a1.x - a2.x) < 1;
  const bVertical = Math.abs(b1.x - b2.x) < 1;
  if (aVertical !== bVertical) return 0;
  if (aVertical) {
    if (Math.abs(a1.x - b1.x) > 1) return 0;
    return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
      - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
  }
  if (Math.abs(a1.y - b1.y) > 1) return 0;
  return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
    - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
}

export function strictPathCrossings(paths: Array<{ id: string; path: Array<{ x: number; y: number }> }>): Array<unknown> {
  const crossings: Array<unknown> = [];
  for (let aIndex = 0; aIndex < paths.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < paths.length; bIndex += 1) {
      const crossing = firstStrictCrossing(paths[aIndex].path, paths[bIndex].path);
      if (crossing) {
        crossings.push({ edgeA: paths[aIndex].id, edgeB: paths[bIndex].id, at: crossing });
      }
    }
  }
  return crossings;
}

export function parseRenderedStraightPath(svgPath: string): Array<{ x: number; y: number }> {
  const tokens = [...svgPath.matchAll(/([MLHVAZ])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi)]
    .map(match => (match[1] ? match[1].toUpperCase() : Number(match[2])));
  const points: Array<{ x: number; y: number }> = [];
  let index = 0;
  let command: string | null = null;
  let current = { x: 0, y: 0 };
  const isCommand = (value: unknown): value is string => typeof value === 'string';
  const moveTo = (point: { x: number; y: number }) => {
    current = point;
    if (points.length === 0) points.push(point);
  };
  const lineTo = (point: { x: number; y: number }) => {
    points.push(point);
    current = point;
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++] as string;
    if (!command) break;
    if (command === 'M') {
      if (index + 1 >= tokens.length) break;
      moveTo({ x: Number(tokens[index++]), y: Number(tokens[index++]) });
      command = 'L';
    } else if (command === 'L') {
      while (index + 1 < tokens.length && !isCommand(tokens[index])) {
        lineTo({ x: Number(tokens[index++]), y: Number(tokens[index++]) });
      }
    } else if (command === 'H') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        lineTo({ x: Number(tokens[index++]), y: current.y });
      }
    } else if (command === 'V') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        lineTo({ x: current.x, y: Number(tokens[index++]) });
      }
    } else if (command === 'A') {
      while (index + 6 < tokens.length && !isCommand(tokens[index])) {
        index += 5;
        current = { x: Number(tokens[index++]), y: Number(tokens[index++]) };
        points.push(current);
      }
    } else if (command === 'Z') {
      break;
    } else {
      break;
    }
  }
  return points;
}

export function tinyInteriorSegments(path: Array<{ x: number; y: number }>): Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
  const tiny: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  for (let index = 1; index < path.length - 2; index += 1) {
    const length = Math.abs(path[index + 1].x - path[index].x)
      + Math.abs(path[index + 1].y - path[index].y);
    if (length > 1 && length < 24) {
      tiny.push({ from: path[index], to: path[index + 1] });
    }
  }
  return tiny;
}

export function shortEndpointSegments(path: Array<{ x: number; y: number }>): Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
  if (path.length < 3) return [];
  const candidates = [
    { from: path[0], to: path[1] },
    { from: path[path.length - 2], to: path[path.length - 1] },
  ];
  return candidates.filter(({ from, to }) => (
    Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < 32
  ));
}

export function tinyRenderedSegments(path: Array<{ x: number; y: number }>): Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
  const tiny: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    const horizontal = Math.abs(from.y - to.y) < 1 && Math.abs(from.x - to.x) > 1;
    const vertical = Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) > 1;
    if (!horizontal && !vertical) continue;
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (length > 1 && length < 12) tiny.push({ from, to });
  }
  return tiny;
}

export function countHairpins(path: Array<{ x: number; y: number }>): number {
  const segments = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const horizontal = Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 1;
    const vertical = Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 1;
    if (!horizontal && !vertical) continue;
    segments.push({
      axis: horizontal ? 'h' : 'v',
      direction: horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y),
      length: Math.abs(b.x - a.x) + Math.abs(b.y - a.y),
    });
  }
  let total = 0;
  for (let index = 0; index + 2 < segments.length; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (
      first.axis === last.axis
      && first.axis !== middle.axis
      && first.direction !== 0
      && first.direction === -last.direction
      && middle.length < 112
    ) {
      total += 1;
    }
  }
  return total;
}

function firstStrictCrossing(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
): { x: number; y: number } | null {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      const crossing = strictSegmentCrossing(a[i], a[i + 1], b[j], b[j + 1]);
      if (crossing) return crossing;
    }
  }
  return null;
}

function strictSegmentCrossing(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): { x: number; y: number } | null {
  const aH = Math.abs(a1.y - a2.y) < 1;
  const aV = Math.abs(a1.x - a2.x) < 1;
  const bH = Math.abs(b1.y - b2.y) < 1;
  const bV = Math.abs(b1.x - b2.x) < 1;
  if (aH === bH || (!aH && !aV) || (!bH && !bV)) return null;
  const h1 = aH ? a1 : b1;
  const h2 = aH ? a2 : b2;
  const v1 = aV ? a1 : b1;
  const v2 = aV ? a2 : b2;
  const x = v1.x;
  const y = h1.y;
  if (
    x > Math.min(h1.x, h2.x) + 1
    && x < Math.max(h1.x, h2.x) - 1
    && y > Math.min(v1.y, v2.y) + 1
    && y < Math.max(v1.y, v2.y) - 1
  ) {
    return { x, y };
  }
  return null;
}
