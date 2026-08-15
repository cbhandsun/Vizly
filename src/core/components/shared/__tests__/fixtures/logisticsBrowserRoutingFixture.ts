import type { Edge, Node } from '@xyflow/react';

export type LogisticsBrowserRoute = Readonly<{
  sourceHandle: string;
  targetHandle: string;
  path: Array<{ x: number; y: number }>;
}>;

export const browserLogisticsNodes: Node[] = [
  { id: 'titlegroup-external', type: 'titleGroup', position: { x: 758.1125, y: 0 }, width: 1377, height: 290, measured: { width: 1377, height: 290 }, data: {} },
  { id: 'titlegroup-logistics', type: 'titleGroup', position: { x: 0, y: 450 }, width: 1882, height: 846, measured: { width: 1882, height: 846 }, data: {} },
  { id: 'titlegroup-data', type: 'titleGroup', position: { x: 1254.3375, y: 1456 }, width: 404, height: 290, measured: { width: 404, height: 290 }, data: {} },
  { id: 'upstream', type: 'custom', parentId: 'titlegroup-external', position: { x: 32, y: 106.5 }, width: 210, height: 73, measured: { width: 210, height: 73 }, data: {} },
  { id: 'l-oms', type: 'custom', parentId: 'titlegroup-logistics', position: { x: 935.25, y: 84 }, width: 259, height: 118, measured: { width: 259, height: 118 }, data: {} },
  { id: 'wms', type: 'custom', parentId: 'titlegroup-logistics', position: { x: 50, y: 362 }, width: 282, height: 118, measured: { width: 282, height: 118 }, data: {} },
  { id: 'wcs', type: 'custom', parentId: 'titlegroup-logistics', position: { x: 32, y: 640 }, width: 298, height: 118, measured: { width: 298, height: 118 }, data: {} },
  { id: 'tms', type: 'custom', parentId: 'titlegroup-logistics', position: { x: 923.75, y: 362 }, width: 282, height: 118, measured: { width: 282, height: 118 }, data: {} },
  { id: 'customs', type: 'custom', parentId: 'titlegroup-logistics', position: { x: 1525.75, y: 373 }, width: 282, height: 96, measured: { width: 282, height: 96 }, data: {} },
  { id: 'bms', type: 'custom', parentId: 'titlegroup-logistics', position: { x: 650, y: 640 }, width: 243, height: 118, measured: { width: 243, height: 118 }, data: {} },
  { id: 'yms', type: 'custom', parentId: 'titlegroup-logistics', position: { x: 1213, y: 640 }, width: 250, height: 118, measured: { width: 250, height: 118 }, data: {} },
  { id: 'carrier-portal', type: 'custom', parentId: 'titlegroup-external', position: { x: 562, y: 84 }, width: 211, height: 118, measured: { width: 211, height: 118 }, data: {} },
  { id: 'visibility', type: 'custom', parentId: 'titlegroup-data', position: { x: 32, y: 84 }, width: 296, height: 118, measured: { width: 296, height: 118 }, data: {} },
  { id: 'downstream', type: 'custom', parentId: 'titlegroup-external', position: { x: 1093, y: 106.5 }, width: 219, height: 73, measured: { width: 219, height: 73 }, data: {} },
];

export const browserColdRequestRoutes: Record<string, LogisticsBrowserRoute> = {
  'edge-loms-customs': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1142, y: 653 }, { x: 1142, y: 742 }, { x: 1667, y: 742 }, { x: 1667, y: 822 }] },
  'edge-loms-tms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1038.85, y: 653 }, { x: 1038.85, y: 811 }] },
  'edge-loms-visibility': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1090.65, y: 653 }, { x: 1090.65, y: 802 }, { x: 1473, y: 1080 }, { x: 1434.3375, y: 1218 }, { x: 1434.3375, y: 1539 }] },
  'edge-loms-wms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 987, y: 653 }, { x: 987, y: 742 }, { x: 191, y: 742 }, { x: 191, y: 811 }] },
  'edge-tms-bms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 994, y: 931 }, { x: 994, y: 1020 }, { x: 976, y: 1020 }, { x: 976, y: 943 }, { x: 830, y: 943 }, { x: 830, y: 931 }, { x: 812, y: 931 }, { x: 812, y: 1089 }] },
  'edge-tms-carrier': { sourceHandle: 'top', targetHandle: 'bottom', path: [{ x: 1018, y: 811 }, { x: 1018, y: 722 }, { x: 1426, y: 722 }, { x: 1426, y: 203 }] },
  'edge-tms-downstream': { sourceHandle: 'top', targetHandle: 'bottom', path: [{ x: 1065, y: 812 }, { x: 1065, y: 723 }, { x: 1924, y: 723 }, { x: 1924, y: 181 }] },
  'edge-tms-visibility': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1135, y: 931 }, { x: 1135, y: 1020 }, { x: 1508, y: 1020 }, { x: 1508, y: 1539 }] },
  'edge-tms-yms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 1065, y: 931 }, { x: 1065, y: 1020 }, { x: 1201, y: 1020 }, { x: 1201, y: 1000 }, { x: 1338, y: 1000 }, { x: 1338, y: 1089 }] },
  'edge-upstream-loms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 895, y: 181 }, { x: 895, y: 236 }, { x: 1065, y: 236 }, { x: 1065, y: 533 }] },
  'edge-visibility-downstream': { sourceHandle: 'top', targetHandle: 'bottom', path: [{ x: 1434, y: 1539 }, { x: 1434, y: 1457 }, { x: 1997, y: 1457 }, { x: 1997, y: 181 }] },
  'edge-wms-bms': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 191, y: 931 }, { x: 191, y: 1000 }, { x: 731, y: 1000 }, { x: 731, y: 1089 }] },
  'edge-wms-visibility': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 262, y: 931 }, { x: 262, y: 1450 }, { x: 1360, y: 1450 }, { x: 1360, y: 1539 }] },
  'edge-wms-wcs': { sourceHandle: 'bottom', targetHandle: 'top', path: [{ x: 121, y: 931 }, { x: 121, y: 1020 }, { x: 181, y: 1020 }, { x: 181, y: 1089 }] },
};

/** Restores source-graph handles omitted by compact precompiled route artifacts. */
export const restoreBrowserColdRequestRouteHandles = <T extends Edge[]>(edges: T): T => (
  edges.map((edge) => {
    const sourceRoute = browserColdRequestRoutes[edge.id];
    return sourceRoute ? {
      ...edge,
      sourceHandle: edge.sourceHandle ?? sourceRoute.sourceHandle,
      targetHandle: edge.targetHandle ?? sourceRoute.targetHandle,
    } : edge;
  }) as T
);
