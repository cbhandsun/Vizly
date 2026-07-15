import type { Edge } from '@xyflow/react';

export type TestPoint = { x: number; y: number };

export function hasStrictCrossing(a: TestPoint[], b: TestPoint[]): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const a1 = a[i];
      const a2 = a[i + 1];
      const b1 = b[j];
      const b2 = b[j + 1];
      const aH = Math.abs(a1.y - a2.y) < 0.5;
      const aV = Math.abs(a1.x - a2.x) < 0.5;
      const bH = Math.abs(b1.y - b2.y) < 0.5;
      const bV = Math.abs(b1.x - b2.x) < 0.5;
      if (aH === bH || (!aH && !aV) || (!bH && !bV)) continue;
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
        return true;
      }
    }
  }
  return false;
}

export function maxParallelOverlap(a: TestPoint[], b: TestPoint[]): number {
  let maxOverlap = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
    }
  }
  return maxOverlap;
}

export function pathLength(path: TestPoint[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y);
  }
  return total;
}

export function terminalStubLength(path: TestPoint[], atStart: boolean): number {
  if (path.length < 2) return 0;
  const first = atStart ? path[0] : path[path.length - 1];
  const second = atStart ? path[1] : path[path.length - 2];
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

export function renderedSystemsInteractionEdges(): Edge[] {
  const paths: Array<[string, string, string, TestPoint[]]> = [
    ['edge-carrier-customer', 'carrier', 'customer', [{ x: 325, y: 3752 }, { x: 325, y: 3910 }]],
    ['edge-master-data-oms-order', 'master-data', 'oms-order', [{ x: 310, y: 746 }, { x: 310, y: 977 }]],
    ['edge-master-data-tms-planning', 'master-data', 'tms-planning', [{ x: 310, y: 746 }, { x: 310, y: 842 }, { x: 0, y: 842 }, { x: 0, y: 3124 }, { x: 40, y: 3124 }, { x: 40, y: 2711 }, { x: 310, y: 2711 }, { x: 310, y: 2807 }]],
    ['edge-master-data-wms-inventory', 'master-data', 'wms-inventory', [{ x: 310, y: 746 }, { x: 310, y: 842 }, { x: 520, y: 842 }, { x: 520, y: 2040 }, { x: 320, y: 2040 }, { x: 320, y: 2152 }, { x: 310, y: 2152 }, { x: 310, y: 2170 }]],
    ['edge-oms-atc-fulfill', 'oms-atc', 'oms-fulfill', [{ x: 210, y: 1454 }, { x: 210, y: 1528 }, { x: 314, y: 1528 }, { x: 314, y: 1612 }]],
    ['edge-oms-fulfill-wms-outbound', 'oms-fulfill', 'wms-outbound', [{ x: 314, y: 1772 }, { x: 314, y: 1820 }, { x: 128, y: 1820 }, { x: 128, y: 2392 }, { x: 310, y: 2392 }, { x: 310, y: 2488 }]],
    ['edge-oms-order-atc', 'oms-order', 'oms-atc', [{ x: 369, y: 1136 }, { x: 369, y: 1295 }]],
    ['edge-sales-oms-order', 'sales', 'oms-order', [{ x: 317, y: 200 }, { x: 317, y: 289 }, { x: 640, y: 289 }, { x: 640, y: 880 }, { x: 315, y: 880 }, { x: 315, y: 976 }]],
    ['edge-tms-execution-carrier', 'tms-execution', 'carrier', [{ x: 310, y: 3284 }, { x: 310, y: 3683 }]],
    ['edge-tms-execution-oms-order', 'tms-execution', 'oms-order', [{ x: 380, y: 3124 }, { x: 380, y: 3028 }, { x: 322, y: 3028 }, { x: 322, y: 3124 }, { x: 28, y: 3124 }, { x: 28, y: 1232 }, { x: 314, y: 1232 }, { x: 314, y: 1136 }]],
    ['edge-tms-execution-wms-outbound', 'tms-execution', 'wms-outbound', [{ x: 240, y: 3124 }, { x: 240, y: 3028 }, { x: 106, y: 3028 }, { x: 106, y: 2744 }, { x: 310, y: 2744 }, { x: 310, y: 2648 }]],
    ['edge-tms-planning-execution', 'tms-planning', 'tms-execution', [{ x: 310, y: 2966 }, { x: 310, y: 3124 }]],
    ['edge-wms-inventory-oms-atc', 'wms-inventory', 'oms-atc', [{ x: 310, y: 2170 }, { x: 310, y: 2026 }, { x: 516, y: 2026 }, { x: 516, y: 1538 }, { x: 314, y: 1538 }, { x: 314, y: 1454 }]],
    ['edge-wms-inventory-outbound', 'wms-inventory', 'wms-outbound', [{ x: 310, y: 2330 }, { x: 310, y: 2489 }]],
    ['edge-wms-outbound-oms-fulfill', 'wms-outbound', 'oms-fulfill', [{ x: 193, y: 2488 }, { x: 193, y: 2392 }, { x: 137, y: 2392 }, { x: 137, y: 1914 }, { x: 314, y: 1914 }, { x: 314, y: 1772 }]],
    ['edge-wms-outbound-tms-planning', 'wms-outbound', 'tms-planning', [{ x: 366, y: 2648 }, { x: 366, y: 2806 }]],
  ];

  return paths.map(([id, source, target, computedPath]) => ({
    id,
    source,
    target,
    data: { computedPath },
  }));
}

function segmentOverlap(a1: TestPoint, a2: TestPoint, b1: TestPoint, b2: TestPoint): number {
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

export function pathHitsRect(
  path: TestPoint[],
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.5;
    if (horizontal) {
      const y = a.y;
      if (y <= rect.y || y >= rect.y + rect.height) continue;
      if (Math.max(Math.min(a.x, b.x), rect.x) < Math.min(Math.max(a.x, b.x), rect.x + rect.width)) {
        return true;
      }
    }
    if (vertical) {
      const x = a.x;
      if (x <= rect.x || x >= rect.x + rect.width) continue;
      if (Math.max(Math.min(a.y, b.y), rect.y) < Math.min(Math.max(a.y, b.y), rect.y + rect.height)) {
        return true;
      }
    }
  }
  return false;
}
