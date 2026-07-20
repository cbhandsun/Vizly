import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairDisplayMicroArtifacts } from '../edgeDisplayMicroCleanup';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';

describe('repairDisplayMicroArtifacts', () => {
  it('collapses a consecutive tiny stair in a long master-data return lane', () => {
    const edges: Edge[] = [{
      id: 'e_md_erp',
      source: 'master-data',
      target: 'erp',
      data: {
        computedPath: [
          { x: 4351, y: 496 },
          { x: 4255, y: 496 },
          { x: 4255, y: 686 },
          { x: 4243, y: 686 },
          { x: 4243, y: 698 },
          { x: 347, y: 698 },
          { x: 347, y: 638 },
          { x: 291, y: 638 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 4351, y: 496 },
      { x: 4255, y: 496 },
      { x: 4255, y: 638 },
      { x: 291, y: 638 },
    ]);
  });

  it('collapses a consecutive tiny terminal stair without moving endpoints', () => {
    const edges: Edge[] = [{
      id: 'edge-driver-tms-execution',
      source: 'driver-management',
      target: 'tms-execution',
      data: {
        computedPath: [
          { x: 1451, y: 1187 },
          { x: 1451, y: 1255 },
          { x: 1533, y: 1255 },
          { x: 1533, y: 1913 },
          { x: 1437, y: 1913 },
          { x: 1437, y: 1927 },
          { x: 1425, y: 1927 },
          { x: 1425, y: 1985 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 1451, y: 1187 },
      { x: 1451, y: 1255 },
      { x: 1533, y: 1255 },
      { x: 1533, y: 1927 },
      { x: 1425, y: 1927 },
      { x: 1425, y: 1985 },
    ]);
  });

  it('collapses a tiny same-direction side step in the middle of a long route', () => {
    const edges: Edge[] = [{
      id: 'edge-loms-visibility',
      source: 'l-oms',
      target: 'visibility',
      data: {
        computedPath: [
          { x: 916, y: 653 },
          { x: 916, y: 754 },
          { x: 1216, y: 754 },
          { x: 1216, y: 1020 },
          { x: 1226, y: 1020 },
          { x: 1226, y: 1068 },
          { x: 1264, y: 1068 },
          { x: 1264, y: 1450 },
          { x: 1216, y: 1450 },
          { x: 1216, y: 1539 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);
    const repairedPath = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(repairedPath[0]).toEqual({ x: 916, y: 653 });
    expect(repairedPath[repairedPath.length - 1]).toEqual({ x: 1216, y: 1539 });
    expect(repairedPath).not.toContainEqual({ x: 1226, y: 1020 });
    expect(repairedPath.length).toBeLessThan(10);
  });

  it('collapses a tiny bridge between same-direction continuation lanes', () => {
    const edges: Edge[] = [{
      id: 'edge-tms-carrier',
      source: 'tms',
      target: 'carrier-portal',
      data: {
        computedPath: [
          { x: 904, y: 811 },
          { x: 1011, y: 811 },
          { x: 1011, y: 759 },
          { x: 1015, y: 759 },
          { x: 1015, y: 629 },
          { x: 1227, y: 629 },
          { x: 1227, y: 203 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 904, y: 811 },
      { x: 1015, y: 811 },
      { x: 1015, y: 629 },
      { x: 1227, y: 629 },
      { x: 1227, y: 203 },
    ]);
  });

  it('extends a tiny bridge when collapsing it would cross a nearby blocker lane', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-customs',
        source: 'l-oms',
        target: 'customs',
        data: {
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 750 },
            { x: 1428, y: 750 },
            { x: 1428, y: 822 },
          ],
        },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier-portal',
        data: {
          computedPath: [
            { x: 904, y: 811 },
            { x: 1011, y: 811 },
            { x: 1011, y: 751 },
            { x: 1015, y: 751 },
            { x: 1015, y: 629 },
            { x: 1227, y: 629 },
            { x: 1227, y: 203 },
          ],
        },
      },
    ];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);
    const carrierPath = (repaired[1].data as any).computedPath;

    expect(quality.strictCrossings).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(carrierPath[0]).toEqual({ x: 904, y: 811 });
    expect(carrierPath[carrierPath.length - 1]).toEqual({ x: 1227, y: 203 });
    expect(carrierPath).not.toContainEqual({ x: 1011, y: 751 });
    expect(carrierPath).not.toContainEqual({ x: 1015, y: 751 });
  });

  it('collapses an over-detoured outer ring back to the target-side trunk', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        data: {
          sharedTrunkSynthesized: true,
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 742 },
            { x: 22, y: 742 },
            { x: 22, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
        },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier-portal',
        data: {
          computedPath: [
            { x: 916, y: 930 },
            { x: 916, y: 1019 },
            { x: 1536, y: 1019 },
            { x: 1536, y: 292 },
            { x: 1227, y: 292 },
            { x: 1227, y: 203 },
          ],
        },
      },
      {
        id: 'edge-tms-visibility',
        source: 'tms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 916, y: 931 },
            { x: 916, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
          sharedTrunkSynthesized: true,
        },
      },
      {
        id: 'edge-wms-visibility',
        source: 'wms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 149, y: 931 },
            { x: 149, y: 1020 },
            { x: 286, y: 1020 },
            { x: 286, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
          sharedTrunkSynthesized: true,
        },
      },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.strictCrossings).toBe(0);
    expect(
      quality.detourPenalty,
      JSON.stringify({
        baseline,
        quality,
        repairedPath: (repaired[0].data as any).computedPath,
      }, null, 2),
    ).toBeLessThan(baseline.detourPenalty);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 916, y: 653 },
      { x: 916, y: 742 },
      { x: 892, y: 742 },
      { x: 892, y: 1450 },
      { x: 1216, y: 1450 },
      { x: 1216, y: 1539 },
    ]);
  });

  it('pulls a blocker-driven outer ring back from the canvas boundary to the nearest safe lane', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 742 },
            { x: 22, y: 742 },
            { x: 22, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
        },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier-portal',
        data: {
          computedPath: [
            { x: 916, y: 930 },
            { x: 916, y: 1019 },
            { x: 1536, y: 1019 },
            { x: 1536, y: 292 },
            { x: 1227, y: 292 },
            { x: 1227, y: 203 },
          ],
        },
      },
      {
        id: 'edge-tms-bms',
        source: 'tms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 916, y: 931 },
            { x: 916, y: 1000 },
            { x: 660, y: 1000 },
            { x: 660, y: 1089 },
          ],
        },
      },
      {
        id: 'edge-wms-bms',
        source: 'wms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 154, y: 931 },
            { x: 154, y: 1020 },
            { x: 660, y: 1020 },
            { x: 660, y: 1089 },
          ],
        },
      },
      {
        id: 'edge-wms-visibility',
        source: 'wms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 149, y: 931 },
            { x: 149, y: 1020 },
            { x: 286, y: 1020 },
            { x: 286, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
        },
      },
      {
        id: 'edge-tms-visibility',
        source: 'tms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 916, y: 931 },
            { x: 916, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
        },
      },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);
    const repairedPath = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(quality.strictCrossings).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.unexplainedRelatedOverlap).toBe(0);
    expect(quality.detourPenalty).toBeLessThan(baseline.detourPenalty);
    expect(quality.totalLength).toBeLessThan(baseline.totalLength);
    expect(repairedPath).toEqual([
      { x: 916, y: 653 },
      { x: 916, y: 742 },
      { x: 132, y: 742 },
      { x: 132, y: 1450 },
      { x: 1216, y: 1450 },
      { x: 1216, y: 1539 },
    ]);
  });

  it('replaces a tiny return side step with a readable bypass lane', () => {
    const edges: Edge[] = [{
      id: 'edge-tms-execution-oms-order',
      source: 'tms-execution',
      target: 'oms-order',
      data: {
        computedPath: [
          { x: 421, y: 2027 },
          { x: 421, y: 1955 },
          { x: 223, y: 1955 },
          { x: 223, y: 501 },
          { x: 255, y: 501 },
          { x: 255, y: 491 },
          { x: 315, y: 491 },
          { x: 315, y: 453 },
          { x: 267, y: 453 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBeLessThanOrEqual(1);
    expect((repaired[0].data as any).computedPath).not.toContainEqual({ x: 255, y: 491 });
  });

  it('extends a short terminal stub to the readable display minimum', () => {
    const edges: Edge[] = [{
      id: 'edge-gps-tms-execution',
      source: 'gps',
      target: 'tms-execution',
      data: {
        computedPath: [
          { x: 1244, y: 620 },
          { x: 1244, y: 998 },
          { x: 1555, y: 998 },
          { x: 1555, y: 1959 },
          { x: 1437, y: 1959 },
          { x: 1437, y: 1985 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.shortEndpointStubs).toBe(0);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 1244, y: 620 },
      { x: 1244, y: 998 },
      { x: 1555, y: 998 },
      { x: 1555, y: 1945 },
      { x: 1437, y: 1945 },
      { x: 1437, y: 1985 },
    ]);
  });

  it('routes short start stubs through side exits when a direct extension would overlap an incoming lane', () => {
    const edges: Edge[] = [
      {
        id: 'e-labor-input',
        source: 'labor-input',
        target: 'labor',
        data: {
          computedPath: [
            { x: 5047.4, y: 1582 },
            { x: 5365.4, y: 1582 },
          ],
        },
      },
      {
        id: 'e-labor-alloc-fb',
        source: 'labor',
        target: 'allocation',
        data: {
          computedPath: [
            { x: 5365, y: 1582 },
            { x: 5343, y: 1582 },
            { x: 5343, y: 72 },
            { x: 1182, y: 72 },
            { x: 1182, y: 1306 },
            { x: 1211, y: 1306 },
            { x: 1211, y: 1466 },
            { x: 1115, y: 1466 },
          ],
        },
      },
      {
        id: 'e-labor-group-fb',
        source: 'labor',
        target: 'grouping',
        data: {
          computedPath: [
            { x: 5365, y: 1582 },
            { x: 5343, y: 1582 },
            { x: 5343, y: 2083 },
            { x: 3341, y: 2083 },
            { x: 3341, y: 1253 },
            { x: 2796, y: 1253 },
          ],
        },
      },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.shortEndpointStubs).toBe(2);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.reverseOverlap).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
  });

  it('cleans a mixed trunk conflict without transferring micro artifacts', () => {
    const edges: Edge[] = [
      {
        id: 'edge-driver-tms-execution',
        source: 'driver-management',
        target: 'tms-execution',
        data: {
          computedPath: [
            { x: 1451, y: 1187 },
            { x: 1451, y: 1255 },
            { x: 1533, y: 1255 },
            { x: 1533, y: 1913 },
            { x: 1437, y: 1913 },
            { x: 1437, y: 1927 },
            { x: 1425, y: 1927 },
            { x: 1425, y: 1985 },
          ],
        },
      },
      {
        id: 'edge-gps-tms-execution',
        source: 'gps',
        target: 'tms-execution',
        data: {
          computedPath: [
            { x: 1244, y: 620 },
            { x: 1244, y: 998 },
            { x: 1555, y: 998 },
            { x: 1555, y: 1959 },
            { x: 1437, y: 1959 },
            { x: 1437, y: 1985 },
          ],
        },
      },
      {
        id: 'edge-tms-planning-execution',
        source: 'tms-planning',
        target: 'tms-execution',
        data: {
          computedPath: [
            { x: 1437, y: 1827 },
            { x: 1437, y: 1985 },
          ],
        },
      },
      {
        id: 'edge-tms-cost',
        source: 'tms-planning',
        target: 'cost-analysis',
        data: {
          computedPath: [
            { x: 1437, y: 1827 },
            { x: 1437, y: 1967 },
            { x: 1682, y: 1967 },
            { x: 1682, y: 2751 },
          ],
        },
      },
    ];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.strictCrossings).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(
      quality.shortEndpointStubs,
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: (edge.data as any).computedPath })), null, 2),
    ).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('collapses broad display hairpin bridges without moving endpoints', () => {
    const edges: Edge[] = [{
      id: 'e-atp',
      source: 'order-promise',
      target: 'inventory-check',
      data: {
        computedPath: [
          { x: 1114, y: 1418 },
          { x: 1186, y: 1418 },
          { x: 1186, y: 1346 },
          { x: 1258, y: 1346 },
          { x: 1258, y: 1458 },
          { x: 1282, y: 1458 },
          { x: 1282, y: 1000 },
          { x: 1440, y: 1000 },
        ],
      },
    }];
    const baseline = calculateEdgePathQualityScore(edges);

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);
    const path = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(baseline.hairpins).toBeGreaterThan(0);
    expect(quality.hairpins).toBe(0);
    expect(quality.totalLength).toBeLessThan(baseline.totalLength);
    expect(path[0]).toEqual({ x: 1114, y: 1418 });
    expect(path[path.length - 1]).toEqual({ x: 1440, y: 1000 });
  });

  it('collapses a near-return display loop into the continuing lane', () => {
    const edges: Edge[] = [{
      id: 'e-reservation',
      source: 'order-promise',
      target: 'reservation',
      data: {
        computedPath: [
          { x: 1114, y: 1418 },
          { x: 808, y: 1418 },
          { x: 808, y: 1370 },
          { x: 1103, y: 1370 },
          { x: 1103, y: 1466 },
          { x: 1388, y: 1466 },
          { x: 1388, y: 1233 },
          { x: 1444, y: 1233 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.hairpins).toBe(0);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 1114, y: 1418 },
      { x: 1114, y: 1466 },
      { x: 1388, y: 1466 },
      { x: 1388, y: 1233 },
      { x: 1444, y: 1233 },
    ]);
  });

  it('flattens a tiny bridge that causes a long reverse overlap', () => {
    const edges: Edge[] = [
      {
        id: 'e_oms_so',
        source: 'oms',
        target: 'so',
        data: {
          computedPath: [
            { x: 255, y: 936 },
            { x: 351, y: 936 },
            { x: 351, y: 930 },
            { x: 5305, y: 930 },
            { x: 5305, y: 506 },
            { x: 5401, y: 506 },
          ],
        },
      },
      {
        id: 'e_so_inv',
        source: 'so',
        target: 'inventory',
        data: {
          computedPath: [
            { x: 5401, y: 541 },
            { x: 5312, y: 541 },
            { x: 5312, y: 930 },
            { x: 2493, y: 930 },
            { x: 2493, y: 906 },
            { x: 2475, y: 906 },
            { x: 2475, y: 205 },
            { x: 2386, y: 205 },
          ],
        },
      },
    ];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.reverseOverlap).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 255, y: 936 },
      { x: 5305, y: 936 },
      { x: 5305, y: 506 },
      { x: 5401, y: 506 },
    ]);
  });

  it('collapses a monotonic display stair when it reduces bends without adding length', () => {
    const edges: Edge[] = [{
      id: 'edge-tms-carrier',
      source: 'tms',
      target: 'carrier-portal',
      data: {
        computedPath: [
          { x: 1227, y: 961 },
          { x: 1227, y: 939 },
          { x: 1311, y: 939 },
          { x: 1311, y: 865 },
          { x: 1769, y: 865 },
          { x: 1769, y: 278 },
        ],
      },
    }];
    const baseline = calculateEdgePathQualityScore(edges);

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.bends).toBeLessThan(baseline.bends);
    expect(quality.totalLength).toBe(baseline.totalLength);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 1227, y: 961 },
      { x: 1227, y: 865 },
      { x: 1769, y: 865 },
      { x: 1769, y: 278 },
    ]);
  });

  it('uses a shallow escape lane instead of preserving a large return loop', () => {
    const edges: Edge[] = [{
      id: 'edge-tms-carrier',
      source: 'tms',
      target: 'carrier-portal',
      data: {
        computedPath: [
          { x: 1323, y: 1198 },
          { x: 1323, y: 1649 },
          { x: 2285, y: 1649 },
          { x: 2285, y: 861 },
          { x: 1769, y: 861 },
          { x: 1769, y: 278 },
        ],
      },
    }];
    const baseline = calculateEdgePathQualityScore(edges);

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.detourPenalty).toBeLessThan(baseline.detourPenalty);
    expect(quality.bends).toBeLessThan(baseline.bends);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 1323, y: 1198 },
      { x: 1323, y: 1230 },
      { x: 1769, y: 1230 },
      { x: 1769, y: 278 },
    ]);
  });

  it('collapses a one-pixel endpoint bridge before display', () => {
    const edges: Edge[] = [{
      id: 'edge-wms-outbound-oms-fulfill',
      source: 'wms-outbound',
      target: 'oms-fulfill',
      data: {
        computedPath: [
          { x: 148, y: 2123 },
          { x: 148, y: 2122 },
          { x: 304, y: 2122 },
          { x: 304, y: 1465 },
          { x: 198, y: 1465 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.shortEndpointStubs).toBe(0);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 148, y: 2123 },
      { x: 304, y: 2123 },
      { x: 304, y: 1465 },
      { x: 198, y: 1465 },
    ]);
  });

  it('reroutes a short middle return bridge onto a readable parallel lane', () => {
    const edges: Edge[] = [{
      id: 'e_move_inv',
      source: 'movement',
      target: 'inventory',
      data: {
        computedPath: [
          { x: 3873, y: 223 },
          { x: 2306, y: 223 },
          { x: 2306, y: 205 },
          { x: 2386, y: 205 },
        ],
      },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
    const path = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    expect(path).toHaveLength(4);
    expect(path[0]).toEqual({ x: 3873, y: 223 });
    expect(path[3]).toEqual({ x: 2386, y: 205 });
    expect(path[1].y).toBe(path[2].y);
    expect(Math.abs(path[1].y - path[0].y)).toBeGreaterThanOrEqual(32);
    expect(Math.abs(path[3].y - path[2].y)).toBeGreaterThanOrEqual(32);
  });

  it('removes a near-terminal short return bridge without creating endpoint stubs', () => {
    const edges: Edge[] = [{
      id: 'e_md_asn',
      source: 'master-data',
      target: 'asn',
      data: {
        computedPath: [
          { x: 4351, y: 467 },
          { x: 2463, y: 467 },
          { x: 2463, y: 557 },
          { x: 867, y: 557 },
          { x: 867, y: 534 },
          { x: 776, y: 534 },
        ],
      },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.tinyInteriorDoglegs).toBeGreaterThan(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('removes a near-target WMS master-data return loop', () => {
    const edges: Edge[] = [{
      id: 'e_md_oms',
      source: 'master-data',
      target: 'oms',
      data: {
        computedPath: [
          { x: 4351, y: 496 },
          { x: 4251, y: 496 },
          { x: 4251, y: 930 },
          { x: 351, y: 930 },
          { x: 351, y: 875 },
          { x: 255, y: 875 },
          { x: 255, y: 923 },
        ],
      },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.hairpins).toBeGreaterThan(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('flattens a wide WMS master-data short-bridge hairpin without moving endpoints', () => {
    const edges: Edge[] = [{
      id: 'e_md_erp',
      source: 'master-data',
      target: 'erp',
      data: {
        computedPath: [
          { x: 4351, y: 496 },
          { x: 4351, y: 105 },
          { x: 4822, y: 105 },
          { x: 4822, y: 73 },
          { x: 291, y: 73 },
          { x: 291, y: 638 },
        ],
      },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);
    const path = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(baseline.hairpins).toBeGreaterThan(0);
    expect(quality.hairpins).toBe(0);
    expect(quality.totalLength).toBeLessThan(baseline.totalLength);
    expect(path[0]).toEqual({ x: 4351, y: 496 });
    expect(path[path.length - 1]).toEqual({ x: 291, y: 638 });
  });

  it('routes a WMS receipt reporting start loop through a readable side lane', () => {
    const edges: Edge[] = [{
      id: 'e_receipt_bi',
      source: 'receipt',
      target: 'bi-reporting',
      data: {
        computedPath: [
          { x: 1327, y: 506 },
          { x: 1417, y: 506 },
          { x: 1417, y: 478 },
          { x: 1315, y: 478 },
          { x: 1315, y: 110 },
          { x: 4822, y: 110 },
          { x: 4822, y: 496 },
          { x: 4911, y: 496 },
        ],
      },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.hairpins).toBeGreaterThan(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('slides a near-target labor heatmap endpoint to remove a terminal return loop', () => {
    const edges: Edge[] = [{
      id: 'e-heat-labor',
      source: 'heatmap',
      target: 'labor',
      data: {
        computedPath: [
          { x: 4563, y: 1779 },
          { x: 4611, y: 1779 },
          { x: 4611, y: 1602 },
          { x: 4813, y: 1602 },
          { x: 4813, y: 1650 },
          { x: 4885, y: 1650 },
          { x: 4885, y: 1582 },
        ],
      },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.hairpins).toBeGreaterThan(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('collapses a near-target labor alert terminal return loop', () => {
    const edges: Edge[] = [{
      id: 'e-alert-labor',
      source: 'alert',
      target: 'labor',
      data: {
        computedPath: [
          { x: 4566, y: 1999 },
          { x: 4566, y: 1944 },
          { x: 4711, y: 1944 },
          { x: 4711, y: 1614 },
          { x: 4917, y: 1614 },
          { x: 4917, y: 1582 },
          { x: 4885, y: 1582 },
        ],
      },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.hairpins).toBeGreaterThan(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

});
