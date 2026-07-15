import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { countStrictEdgeCrossings } from '../../../../strategies/shared/edgeStrictCrossingGuard';
import {
  createBaseDiagramDisplayEdges,
  hasTrustedLayoutPath,
} from '../baseDiagramDisplayEdges';
import { prepareBaseDiagramDisplayEdges } from '../baseDiagramEdgePreparation';

const makeEdge = (data: Edge['data'], type = 'advanced-smart'): Edge => ({
  id: 'edge-a-b',
  source: 'a',
  target: 'b',
  type,
  data,
});

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  data: {},
  measured: { width, height },
  width,
  height,
});

describe('baseDiagramDisplayEdges', () => {
  it('keeps lightweight canvas preparation referentially stable when no promotion is needed', () => {
    const edges = [makeEdge({ computedPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }, 'default')];

    expect(prepareBaseDiagramDisplayEdges(edges)).toBe(edges);
  });

  it('promotes locked computed paths to the stable renderer', () => {
    const edge = makeEdge({
      layoutPathLocked: true,
      sharedTrunkAware: true,
      computedPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    });

    const [displayEdge] = createBaseDiagramDisplayEdges([edge]);

    expect(hasTrustedLayoutPath(edge)).toBe(true);
    expect(displayEdge.type).toBe('stablePath');
    expect(displayEdge.data).toBe(edge.data);
  });

  it('promotes ordinary locked computed paths to the stable renderer', () => {
    const edge = makeEdge({
      layoutPathLocked: true,
      computedPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    }, 'smart');

    const [displayEdge] = createBaseDiagramDisplayEdges([edge]);

    expect(hasTrustedLayoutPath(edge)).toBe(true);
    expect(displayEdge.type).toBe('stablePath');
  });

  it('does not promote invalid computed paths', () => {
    const edge = makeEdge({
      layoutPathLocked: true,
      sharedTrunkAware: true,
      computedPath: [{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }],
    });

    const [displayEdge] = createBaseDiagramDisplayEdges([edge]);

    expect(hasTrustedLayoutPath(edge)).toBe(false);
    expect(displayEdge).toBe(edge);
  });

  it('runs the shared display quality pass when diagram nodes are available', () => {
    const nodes: Node[] = [
      node('upstream', 985.487, 119, 303, 119),
      node('l-oms', 1120.25, 605, 406, 197),
      node('wms', 42, 962, 420, 236),
      node('wcs', 32, 1358, 420, 236),
      node('tms', 1113.25, 962, 420, 236),
      node('customs', 1853.25, 981.5, 420, 197),
      node('bms', 772, 1377.5, 378, 197),
      node('yms', 1470, 1377.5, 389, 197),
      node('visibility', 1579.69, 1922, 420, 236),
      node('carrier-portal', 1608.49, 80, 322, 197),
      node('downstream', 2250.49, 119, 336, 119),
    ];
    const paths: Array<[string, string, string, Array<{ x: number; y: number }>]> = [
      ['edge-loms-customs', 'l-oms', 'customs', [{ x: 1323, y: 803 }, { x: 1323, y: 885 }, { x: 2063, y: 885 }, { x: 2063, y: 981 }]],
      ['edge-loms-tms', 'l-oms', 'tms', [{ x: 1323, y: 803 }, { x: 1323, y: 962 }]],
      ['edge-loms-visibility', 'l-oms', 'visibility', [{ x: 1323, y: 803 }, { x: 1323, y: 887 }, { x: -6, y: 887 }, { x: -6, y: 1849 }, { x: 1790, y: 1849 }, { x: 1790, y: 1921 }]],
      ['edge-loms-wms', 'l-oms', 'wms', [{ x: 1323, y: 803 }, { x: 1323, y: 887 }, { x: 252, y: 887 }, { x: 252, y: 961 }]],
      ['edge-tms-bms', 'tms', 'bms', [{ x: 1323, y: 1199 }, { x: 1323, y: 1295 }, { x: 973, y: 1295 }, { x: 973, y: 1377 }]],
      ['edge-tms-carrier', 'tms', 'carrier-portal', [{ x: 1227, y: 961 }, { x: 1227, y: 939 }, { x: 1311, y: 939 }, { x: 1311, y: 865 }, { x: 1769, y: 865 }, { x: 1769, y: 278 }]],
      ['edge-tms-downstream', 'tms', 'downstream', [{ x: 1323, y: 962 }, { x: 1323, y: 873 }, { x: 2274, y: 873 }, { x: 2274, y: 239 }]],
      ['edge-tms-visibility', 'tms', 'visibility', [{ x: 1323, y: 1199 }, { x: 1323, y: 1729 }, { x: 1790, y: 1729 }, { x: 1790, y: 1921 }]],
      ['edge-tms-yms', 'tms', 'yms', [{ x: 1323, y: 1199 }, { x: 1323, y: 1295 }, { x: 1665, y: 1295 }, { x: 1665, y: 1377 }]],
      ['edge-upstream-loms', 'upstream', 'l-oms', [{ x: 1137, y: 239 }, { x: 1137, y: 328 }, { x: 1323, y: 328 }, { x: 1323, y: 604 }]],
      ['edge-visibility-downstream', 'visibility', 'downstream', [{ x: 1916, y: 1921 }, { x: 1916, y: 1825 }, { x: 2354, y: 1825 }, { x: 2354, y: 872 }, { x: 2370, y: 872 }, { x: 2370, y: 239 }]],
      ['edge-wms-bms', 'wms', 'bms', [{ x: 252, y: 1199 }, { x: 252, y: 1295 }, { x: 898, y: 1295 }, { x: 898, y: 1211 }, { x: 973, y: 1211 }, { x: 973, y: 1377 }]],
      ['edge-wms-visibility', 'wms', 'visibility', [{ x: 252, y: 1199 }, { x: 252, y: 1295 }, { x: 537, y: 1295 }, { x: 537, y: 1825 }, { x: 1790, y: 1825 }, { x: 1790, y: 1921 }]],
      ['edge-wms-wcs', 'wms', 'wcs', [{ x: 252, y: 1199 }, { x: 252, y: 1295 }, { x: 242, y: 1295 }, { x: 242, y: 1357 }]],
    ];
    const edges = paths.map(([id, source, target, computedPath]) => ({
      id,
      source,
      target,
      type: 'stablePath',
      data: {
        computedPath,
        layoutDirection: 'TB',
      },
    })) as Edge[];

    const displayEdges = createBaseDiagramDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
    });

    expect(countStrictEdgeCrossings(edges)).toBeGreaterThan(0);
    expect(countStrictEdgeCrossings(displayEdges)).toBe(0);
  }, 45_000);
});
