import type { Node } from '@xyflow/react';
import { node } from '../baseReactFlowDisplayEdges.testUtils';

type PositionedNode = Node & {
  positionAbsolute: { x: number; y: number };
};

export const createBrowserLogisticsRouteFixture = () => {
    const browserMeasuredNodes: PositionedNode[] = [
      { ...node('titlegroup-external', 758.1125, 0, 1377, 290), type: 'titleGroup', positionAbsolute: { x: 758.1125, y: 0 } },
      { ...node('titlegroup-logistics', 0, 450, 1882, 846), type: 'titleGroup', positionAbsolute: { x: 0, y: 450 } },
      { ...node('titlegroup-data', 1254.3375, 1456, 404, 290), type: 'titleGroup', positionAbsolute: { x: 1254.3375, y: 1456 } },
      { ...node('upstream', 32, 106.5, 210, 73), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 790.1125, y: 106.5 } },
      { ...node('l-oms', 935.25, 84, 259, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 935.25, y: 534 } },
      { ...node('wms', 50, 362, 282, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 50, y: 812 } },
      { ...node('wcs', 32, 640, 298, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 32, y: 1090 } },
      { ...node('tms', 923.75, 362, 282, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 923.75, y: 812 } },
      { ...node('customs', 1525.75, 373, 282, 96), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1525.75, y: 823 } },
      { ...node('bms', 650, 640, 243, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 650, y: 1090 } },
      { ...node('yms', 1213, 640, 250, 118), parentId: 'titlegroup-logistics', type: 'custom', positionAbsolute: { x: 1213, y: 1090 } },
      { ...node('carrier-portal', 562, 84, 211, 118), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 1320.1125, y: 84 } },
      { ...node('visibility', 32, 84, 296, 118), parentId: 'titlegroup-data', type: 'custom', positionAbsolute: { x: 1286.3375, y: 1540 } },
      { ...node('downstream', 1093, 106.5, 219, 73), parentId: 'titlegroup-external', type: 'custom', positionAbsolute: { x: 1851.1125, y: 106.5 } },
    ];
    const browserLockedRoutes: Record<string, {
      sourceHandle: string;
      targetHandle: string;
      computedPath: Array<{ x: number; y: number }>;
      auto?: boolean;
      metadata?: Record<string, boolean>;
    }> = {
      'edge-loms-customs': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1445, y: 803 },
          { x: 1445, y: 899 },
          { x: 2063, y: 899 },
          { x: 2063, y: 981 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-loms-tms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1282.65, y: 803 },
          { x: 1282.65, y: 961 },
        ],
      },
      'edge-loms-visibility': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1363.85, y: 803 },
          { x: 1363.85, y: 952 },
          { x: 1869, y: 1367.5 },
          { x: 1789.6875, y: 1584.5 },
          { x: 1789.6875, y: 1921 },
        ],
      },
      'edge-tms-carrier': {
        sourceHandle: 'top',
        targetHandle: 'bottom',
        computedPath: [
          { x: 1253, y: 961 },
          { x: 1253, y: 885 },
          { x: 1769, y: 885 },
          { x: 1769, y: 278 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-loms-wms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1201, y: 803 },
          { x: 1201, y: 899 },
          { x: 252, y: 899 },
          { x: 252, y: 961 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-tms-bms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1218, y: 1199 },
          { x: 1218, y: 1295 },
          { x: 1200, y: 1295 },
          { x: 1200, y: 1211 },
          { x: 1042, y: 1211 },
          { x: 1042, y: 1199 },
          { x: 1024, y: 1199 },
          { x: 1024, y: 1377 },
        ],
        metadata: {
          crossingOptimized: true,
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
          sharedTrunkAware: true,
        },
      },
      'edge-tms-downstream': {
        sourceHandle: 'top',
        targetHandle: 'bottom',
        computedPath: [
          { x: 1323, y: 962 },
          { x: 1323, y: 866 },
          { x: 2362, y: 866 },
          { x: 2362, y: 239 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: true,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-tms-visibility': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1428, y: 1199 },
          { x: 1428, y: 1295 },
          { x: 1895, y: 1295 },
          { x: 1895, y: 1921 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-tms-yms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 1323, y: 1199 },
          { x: 1323, y: 1281 },
          { x: 1665, y: 1281 },
          { x: 1665, y: 1377 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-upstream-loms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        auto: true,
        computedPath: [
          { x: 1137, y: 239 },
          { x: 1137, y: 328 },
          { x: 1323, y: 328 },
          { x: 1323, y: 604 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-visibility-downstream': {
        sourceHandle: 'top',
        targetHandle: 'bottom',
        computedPath: [
          { x: 1886, y: 1921 },
          { x: 1886, y: 1827 },
          { x: 2474, y: 1827 },
          { x: 2474, y: 239 },
        ],
        metadata: {
          detachedOverlapSeparated: true,
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-wms-bms': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 252, y: 1199 },
          { x: 252, y: 1281 },
          { x: 898, y: 1281 },
          { x: 898, y: 1377 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-wms-visibility': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 357, y: 1199 },
          { x: 357, y: 1919 },
          { x: 1685, y: 1919 },
          { x: 1685, y: 1921 },
        ],
        metadata: {
          detachedOverlapSeparated: true,
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
      'edge-wms-wcs': {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        computedPath: [
          { x: 147, y: 1199 },
          { x: 147, y: 1295 },
          { x: 242, y: 1295 },
          { x: 242, y: 1357 },
        ],
        metadata: {
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
        },
      },
    };
    const latestBrowserMeasuredRoutes: typeof browserLockedRoutes = {
      'edge-loms-customs': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1142, y: 653 }, { x: 1142, y: 742 }, { x: 1667, y: 742 }, { x: 1667, y: 822 }],
      },
      'edge-loms-tms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1038.85, y: 653 }, { x: 1038.85, y: 811 }],
      },
      'edge-loms-visibility': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1091, y: 653 }, { x: 1091, y: 788 }, { x: 1230, y: 788 }, { x: 1230, y: 823 }, { x: 1438, y: 823 }, { x: 1438, y: 954 }, { x: 1434, y: 954 }, { x: 1434, y: 1066 }, { x: 1487, y: 1066 }, { x: 1487, y: 1232 }, { x: 1434, y: 1232 }, { x: 1434, y: 1539 }],
      },
      'edge-loms-wms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 987, y: 653 }, { x: 987, y: 742 }, { x: 191, y: 742 }, { x: 191, y: 811 }],
      },
      'edge-tms-bms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 994, y: 931 }, { x: 994, y: 1020 }, { x: 976, y: 1020 }, { x: 976, y: 943 }, { x: 830, y: 943 }, { x: 830, y: 931 }, { x: 812, y: 931 }, { x: 812, y: 1089 }],
      },
      'edge-tms-carrier': {
        sourceHandle: 'top', targetHandle: 'bottom',
        computedPath: [{ x: 1018, y: 811 }, { x: 1018, y: 690 }, { x: 1027, y: 690 }, { x: 1027, y: 823 }, { x: 1045, y: 823 }, { x: 1045, y: 835 }, { x: 1408, y: 835 }, { x: 1408, y: 823 }, { x: 1426, y: 823 }, { x: 1426, y: 203 }],
      },
      'edge-tms-downstream': {
        sourceHandle: 'top', targetHandle: 'bottom',
        computedPath: [{ x: 1065, y: 812 }, { x: 1065, y: 790 }, { x: 1924, y: 790 }, { x: 1924, y: 181 }],
      },
      'edge-tms-visibility': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1135, y: 931 }, { x: 1135, y: 1020 }, { x: 1165, y: 1020 }, { x: 1165, y: 1256 }, { x: 1511, y: 1256 }, { x: 1511, y: 1539 }],
      },
      'edge-tms-yms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 1065, y: 931 }, { x: 1065, y: 1020 }, { x: 1201, y: 1020 }, { x: 1201, y: 1000 }, { x: 1338, y: 1000 }, { x: 1338, y: 1089 }],
      },
      'edge-upstream-loms': {
        sourceHandle: 'bottom', targetHandle: 'top', auto: true,
        computedPath: [{ x: 895, y: 181 }, { x: 895, y: 236 }, { x: 1065, y: 236 }, { x: 1065, y: 533 }],
      },
      'edge-visibility-downstream': {
        sourceHandle: 'top', targetHandle: 'bottom',
        computedPath: [{ x: 1523, y: 1539 }, { x: 1523, y: 1513 }, { x: 1997, y: 1513 }, { x: 1997, y: 181 }],
      },
      'edge-wms-bms': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 191, y: 931 }, { x: 191, y: 1000 }, { x: 250, y: 1000 }, { x: 250, y: 919 }, { x: 731, y: 919 }, { x: 731, y: 1089 }],
      },
      'edge-wms-visibility': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 262, y: 931 }, { x: 262, y: 1042 }, { x: 193, y: 1042 }, { x: 193, y: 919 }, { x: -16, y: 919 }, { x: -16, y: 1256 }, { x: 262, y: 1256 }, { x: 262, y: 1450 }, { x: 1360, y: 1450 }, { x: 1360, y: 1539 }],
      },
      'edge-wms-wcs': {
        sourceHandle: 'bottom', targetHandle: 'top',
        computedPath: [{ x: 121, y: 931 }, { x: 121, y: 1020 }, { x: 181, y: 1020 }, { x: 181, y: 1089 }],
      },
    };
    const latestBrowserRouteMetadata: Record<string, Record<string, boolean>> = {
      'edge-loms-customs': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
      },
      'edge-loms-tms': {},
      'edge-loms-visibility': {
        hardObstacleRepaired: true,
        obstacleClearanceOptimized: false,
        sharedTrunkAware: true,
        crossingOptimized: true,
      },
      'edge-loms-wms': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
      },
      'edge-tms-bms': {
        crossingOptimized: true,
        sharedTrunkAware: true,
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
      },
      'edge-tms-carrier': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
        sameNodeInOutCrossingRepaired: true,
        crossingOptimized: true,
        sharedTrunkAware: true,
      },
      'edge-tms-downstream': {
        detachedSourceEndpointReanchored: true,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
        crossingOptimized: true,
        sharedTrunkAware: true,
      },
      'edge-tms-visibility': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
        displayNodeClearanceRepaired: true,
      },
      'edge-tms-yms': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
      },
      'edge-upstream-loms': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
      },
      'edge-visibility-downstream': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
        sameNodeInOutCrossingRepaired: true,
      },
      'edge-wms-bms': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
        crossingOptimized: true,
        sharedTrunkAware: true,
      },
      'edge-wms-visibility': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
        displayNodeClearanceRepaired: true,
        crossingOptimized: true,
        sharedTrunkAware: true,
      },
      'edge-wms-wcs': {
        detachedSourceEndpointReanchored: false,
        detachedTargetEndpointReanchored: false,
        endpointOrthogonalRepaired: true,
      },
    };
    Object.entries(latestBrowserMeasuredRoutes).forEach(([edgeId, route]) => {
      browserLockedRoutes[edgeId] = {
        ...route,
        metadata: latestBrowserRouteMetadata[edgeId],
      };
    });
  return { browserMeasuredNodes, browserLockedRoutes };
};
