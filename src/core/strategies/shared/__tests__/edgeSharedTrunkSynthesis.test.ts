import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { synthesizeSharedEndpointTrunks } from '../edgeSharedTrunkSynthesis';

const coversVerticalSegment = (
  path: Array<{ x: number; y: number }>,
  x: number,
  y1: number,
  y2: number,
) => path.some((point, index) => {
  const next = path[index + 1];
  if (!next || point.x !== x || next.x !== x) return false;
  const minY = Math.min(point.y, next.y);
  const maxY = Math.max(point.y, next.y);
  return minY <= Math.min(y1, y2) && maxY >= Math.max(y1, y2);
});

const coversHorizontalSegment = (
  path: Array<{ x: number; y: number }>,
  y: number,
  x1: number,
  x2: number,
) => path.some((point, index) => {
  const next = path[index + 1];
  if (!next || point.y !== y || next.y !== y) return false;
  const minX = Math.min(point.x, next.x);
  const maxX = Math.max(point.x, next.x);
  return minX <= Math.min(x1, x2) && maxX >= Math.max(x1, x2);
});

const axisOf = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): 'h' | 'v' | null => {
  if (a.y === b.y && a.x !== b.x) return 'h';
  if (a.x === b.x && a.y !== b.y) return 'v';
  return null;
};

const strictlyCrosses = (
  first: Array<{ x: number; y: number }>,
  second: Array<{ x: number; y: number }>,
) => {
  for (let i = 0; i < first.length - 1; i += 1) {
    for (let j = 0; j < second.length - 1; j += 1) {
      const firstAxis = axisOf(first[i], first[i + 1]);
      const secondAxis = axisOf(second[j], second[j + 1]);
      if (!firstAxis || !secondAxis || firstAxis === secondAxis) continue;
      const horizontal = firstAxis === 'h'
        ? { a: first[i], b: first[i + 1] }
        : { a: second[j], b: second[j + 1] };
      const vertical = firstAxis === 'v'
        ? { a: first[i], b: first[i + 1] }
        : { a: second[j], b: second[j + 1] };
      const minX = Math.min(horizontal.a.x, horizontal.b.x);
      const maxX = Math.max(horizontal.a.x, horizontal.b.x);
      const minY = Math.min(vertical.a.y, vertical.b.y);
      const maxY = Math.max(vertical.a.y, vertical.b.y);
      if (vertical.a.x > minX && vertical.a.x < maxX && horizontal.a.y > minY && horizontal.a.y < maxY) {
        return true;
      }
    }
  }
  return false;
};

const uniqueCrossingPoints = (
  firstPaths: Array<Array<{ x: number; y: number }>>,
  secondPaths: Array<Array<{ x: number; y: number }>>,
) => {
  const points = new Set<string>();
  for (const first of firstPaths) {
    for (const second of secondPaths) {
      for (let i = 0; i < first.length - 1; i += 1) {
        for (let j = 0; j < second.length - 1; j += 1) {
          const firstAxis = axisOf(first[i], first[i + 1]);
          const secondAxis = axisOf(second[j], second[j + 1]);
          if (!firstAxis || !secondAxis || firstAxis === secondAxis) continue;
          const horizontal = firstAxis === 'h'
            ? { a: first[i], b: first[i + 1] }
            : { a: second[j], b: second[j + 1] };
          const vertical = firstAxis === 'v'
            ? { a: first[i], b: first[i + 1] }
            : { a: second[j], b: second[j + 1] };
          const minX = Math.min(horizontal.a.x, horizontal.b.x);
          const maxX = Math.max(horizontal.a.x, horizontal.b.x);
          const minY = Math.min(vertical.a.y, vertical.b.y);
          const maxY = Math.max(vertical.a.y, vertical.b.y);
          if (vertical.a.x > minX && vertical.a.x < maxX && horizontal.a.y > minY && horizontal.a.y < maxY) {
            points.add(`${vertical.a.x},${horizontal.a.y}`);
          }
        }
      }
    }
  }
  return points.size;
};

const lastSegmentAxis = (path: Array<{ x: number; y: number }>): 'h' | 'v' | null => {
  const previous = path[path.length - 2];
  const end = path[path.length - 1];
  if (!previous || !end) return null;
  return axisOf(previous, end);
};

describe('synthesizeSharedEndpointTrunks', () => {
  it('coalesces same-source bottom branches onto a shared source trunk', () => {
    const edges: Edge[] = [
      {
        id: 'tms-bms',
        source: 'tms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 1218, y: 1199 },
            { x: 1218, y: 1239 },
            { x: 1024, y: 1239 },
            { x: 1024, y: 1377 },
          ],
        },
      },
      {
        id: 'tms-visibility',
        source: 'tms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 1428, y: 1199 },
            { x: 1428, y: 1239 },
            { x: 1923, y: 1239 },
            { x: 1923, y: 1921 },
          ],
        },
      },
      {
        id: 'tms-yms',
        source: 'tms',
        target: 'yms',
        data: {
          computedPath: [
            { x: 1323, y: 1199 },
            { x: 1323, y: 1259 },
            { x: 1665, y: 1259 },
            { x: 1665, y: 1377 },
          ],
        },
      },
    ];

    const result = synthesizeSharedEndpointTrunks(edges);
    const paths = result.map(edge => (edge.data as any).computedPath as Array<{ x: number; y: number }>);

    expect(paths.map(path => path[0])).toEqual([
      { x: 1323, y: 1199 },
      { x: 1323, y: 1199 },
      { x: 1323, y: 1199 },
    ]);
    expect(paths.map(path => path[1])).toEqual([
      { x: 1323, y: 1239 },
      { x: 1323, y: 1239 },
      { x: 1323, y: 1239 },
    ]);
    expect((result[0].data as any).sharedTrunkSynthesized).toBe(true);
  });

  it('routes a direct same-source edge through the shared source trunk instead of crossing it', () => {
    const edges: Edge[] = [
      {
        id: 'loms-tms',
        source: 'loms',
        target: 'tms',
        data: {
          computedPath: [
            { x: 1283, y: 803 },
            { x: 1283, y: 961 },
          ],
        },
      },
      {
        id: 'loms-wms',
        source: 'loms',
        target: 'wms',
        data: {
          computedPath: [
            { x: 1364, y: 803 },
            { x: 1364, y: 851 },
            { x: 252, y: 851 },
            { x: 252, y: 961 },
          ],
        },
      },
      {
        id: 'loms-customs',
        source: 'loms',
        target: 'customs',
        data: {
          computedPath: [
            { x: 1364, y: 803 },
            { x: 1364, y: 851 },
            { x: 2063, y: 851 },
            { x: 2063, y: 981 },
          ],
        },
      },
    ];

    const result = synthesizeSharedEndpointTrunks(edges);
    const directPath = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(directPath).toEqual([
      { x: 1364, y: 803 },
      { x: 1364, y: 851 },
      { x: 1283, y: 851 },
      { x: 1283, y: 961 },
    ]);
    expect(coversHorizontalSegment(directPath, 851, 1283, 1364)).toBe(true);
  });

  it('moves one source-direction subgroup to a cleaner lane when another trunk crosses it', () => {
    const edge = (
      id: string,
      source: string,
      target: string,
      computedPath: Array<{ x: number; y: number }>,
    ): Edge => ({ id, source, target, data: { computedPath } });
    const edges = [
      edge('loms-wms', 'loms', 'wms', [
        { x: 1323, y: 803 },
        { x: 1323, y: 851 },
        { x: 252, y: 851 },
        { x: 252, y: 961 },
      ]),
      edge('loms-customs', 'loms', 'customs', [
        { x: 1323, y: 803 },
        { x: 1323, y: 851 },
        { x: 2063, y: 851 },
        { x: 2063, y: 981 },
      ]),
      edge('loms-visibility', 'loms', 'visibility', [
        { x: 1323, y: 803 },
        { x: 1323, y: 851 },
        { x: 2309, y: 851 },
        { x: 2309, y: 1865 },
        { x: 1790, y: 1865 },
      ]),
      edge('tms-carrier', 'tms', 'carrier', [
        { x: 1288, y: 961 },
        { x: 1288, y: 914 },
        { x: 1769, y: 914 },
        { x: 1769, y: 278 },
      ]),
      edge('tms-downstream', 'tms', 'downstream', [
        { x: 1288, y: 961 },
        { x: 1288, y: 914 },
        { x: 2418, y: 914 },
        { x: 2418, y: 247 },
      ]),
    ];

    const result = synthesizeSharedEndpointTrunks(edges);
    const leftPath = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const rightPaths = result.slice(1, 3).map(item => (item.data as any).computedPath as Array<{ x: number; y: number }>);
    const crossingPaths = result.slice(3).map(item => (item.data as any).computedPath as Array<{ x: number; y: number }>);

    expect(coversHorizontalSegment(leftPath, 851, 252, 1323)).toBe(true);
    expect(rightPaths.every(path => coversHorizontalSegment(path, 923, 1323, 1769))).toBe(true);
    expect(rightPaths.every(path => !coversHorizontalSegment(path, 851, 1323, 1769))).toBe(true);
    expect(rightPaths.some(path => crossingPaths.some(other => strictlyCrosses(path, other)))).toBe(true);
    expect(uniqueCrossingPoints(rightPaths, crossingPaths)).toBe(1);
  });

  it('leaves unrelated single edges unchanged', () => {
    const edge: Edge = {
      id: 'single',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 0, y: 40 },
          { x: 120, y: 40 },
          { x: 120, y: 200 },
        ],
      },
    };

    expect(synthesizeSharedEndpointTrunks([edge])[0]).toBe(edge);
  });

  it('coalesces same-target top branches onto a shared target trunk', () => {
    const edges: Edge[] = [
      {
        id: 'wms-bms',
        source: 'wms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 40, y: 20 },
            { x: 40, y: 80 },
            { x: 140, y: 80 },
            { x: 140, y: 120 },
            { x: 180, y: 120 },
            { x: 180, y: 180 },
          ],
        },
      },
      {
        id: 'tms-bms',
        source: 'tms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 360, y: 20 },
            { x: 360, y: 100 },
            { x: 260, y: 100 },
            { x: 260, y: 140 },
            { x: 220, y: 140 },
            { x: 220, y: 180 },
          ],
        },
      },
    ];

    const result = synthesizeSharedEndpointTrunks(edges);
    const paths = result.map(edge => (edge.data as any).computedPath as Array<{ x: number; y: number }>);

    expect(paths.every(path => coversVerticalSegment(path, 200, 140, 180))).toBe(true);
    expect(paths.map(path => path[path.length - 1])).toEqual([
      { x: 200, y: 180 },
      { x: 200, y: 180 },
    ]);
    expect(paths.every(path => lastSegmentAxis(path) === 'v')).toBe(true);
    expect((result[0].data as any).sharedTrunkSynthesized).toBe(true);
    expect((result[1].data as any).sharedTrunkSynthesized).toBe(true);
  });

  it('does not leave a tangential boundary tail after target trunk synthesis', () => {
    const edges: Edge[] = [
      {
        id: 'wms-bms',
        source: 'wms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 252, y: 1199 },
            { x: 252, y: 1295 },
            { x: 337, y: 1295 },
            { x: 345, y: 1287 },
            { x: 345, y: 1195 },
            { x: 353, y: 1187 },
            { x: 898, y: 1187 },
            { x: 898, y: 1377 },
          ],
        },
      },
      {
        id: 'tms-bms',
        source: 'tms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 1323, y: 1199 },
            { x: 1323, y: 1295 },
            { x: 1024, y: 1295 },
            { x: 1024, y: 1377 },
          ],
        },
      },
    ];

    const result = synthesizeSharedEndpointTrunks(edges);
    const paths = result.map(edge => (edge.data as any).computedPath as Array<{ x: number; y: number }>);

    expect(paths.map(path => path[path.length - 1])).toEqual([
      { x: 961, y: 1377 },
      { x: 961, y: 1377 },
    ]);
    expect(paths.every(path => lastSegmentAxis(path) === 'v')).toBe(true);
    expect(paths.every(path => !coversHorizontalSegment(path, 1377, 898, 1024))).toBe(true);
  });

  it('keeps a TMS bottom trunk when external crossings do not increase', () => {
    const edge = (
      id: string,
      source: string,
      target: string,
      computedPath: Array<{ x: number; y: number }>,
    ): Edge => ({ id, source, target, data: { computedPath } });
    const edges = [
      edge('loms-visibility', 'loms', 'visibility', [
        { x: 1364, y: 803 },
        { x: 1364, y: 843 },
        { x: 1372, y: 851 },
        { x: 2301, y: 851 },
        { x: 2309, y: 859 },
        { x: 2309, y: 1865 },
        { x: 2301, y: 1873 },
        { x: 1798, y: 1873 },
        { x: 1790, y: 1881 },
        { x: 1790, y: 1921 },
      ]),
      edge('tms-bms', 'tms', 'bms', [
        { x: 1218, y: 1199 },
        { x: 1218, y: 1239 },
        { x: 1210, y: 1247 },
        { x: 1032, y: 1247 },
        { x: 1024, y: 1255 },
        { x: 1024, y: 1377 },
      ]),
      edge('tms-visibility', 'tms', 'visibility', [
        { x: 1428, y: 1199 },
        { x: 1428, y: 1239 },
        { x: 1436, y: 1247 },
        { x: 1915, y: 1247 },
        { x: 1923, y: 1255 },
        { x: 1923, y: 1865 },
      ]),
      edge('tms-yms', 'tms', 'yms', [
        { x: 1323, y: 1199 },
        { x: 1323, y: 1251 },
        { x: 1331, y: 1259 },
        { x: 1657, y: 1259 },
        { x: 1665, y: 1267 },
        { x: 1665, y: 1377 },
      ]),
      edge('wms-visibility', 'wms', 'visibility', [
        { x: 357, y: 1199 },
        { x: 357, y: 1239 },
        { x: 365, y: 1247 },
        { x: 480, y: 1247 },
        { x: 488, y: 1255 },
        { x: 488, y: 1865 },
        { x: 496, y: 1873 },
        { x: 1677, y: 1873 },
        { x: 1685, y: 1881 },
        { x: 1685, y: 1921 },
      ]),
    ];

    const result = synthesizeSharedEndpointTrunks(edges);
    const bottomPaths = result.slice(1, 4).map(item => (item.data as any).computedPath as Array<{ x: number; y: number }>);

    expect(bottomPaths.map(path => path[0])).toEqual([
      { x: 1323, y: 1199 },
      { x: 1323, y: 1199 },
      { x: 1323, y: 1199 },
    ]);
    expect(bottomPaths.map(path => path[1])).toEqual([
      { x: 1323, y: 1247 },
      { x: 1323, y: 1247 },
      { x: 1323, y: 1247 },
    ]);
  });
});
