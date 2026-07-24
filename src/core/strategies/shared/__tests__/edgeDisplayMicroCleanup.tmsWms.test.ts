import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairDisplayMicroArtifacts } from '../edgeDisplayMicroCleanup';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';

describe('repairDisplayMicroArtifacts TMS and WMS regressions', () => {
  it('collapses a TMS GPS near-target two-pixel stair', () => {
    const edges: Edge[] = [{
      id: 'edge-gps-tms-execution',
      source: 'gps',
      target: 'tms-execution',
      data: {
        computedPath: [
          { x: 1244, y: 620 },
          { x: 1244, y: 1001 },
          { x: 1556, y: 1001 },
          { x: 1556, y: 1927 },
          { x: 1451, y: 1927 },
          { x: 1451, y: 1929 },
          { x: 1437, y: 1929 },
          { x: 1437, y: 1985 },
        ],
      },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.tinyInteriorDoglegs).toBe(2);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('collapses a TMS GPS tiny stair without crossing the nearby cost lane', () => {
    const edges: Edge[] = [
      {
        id: 'edge-driver-tms-execution',
        source: 'driver-management',
        target: 'tms-execution',
        data: {
          computedPath: [
            { x: 1451, y: 1187 },
            { x: 1451, y: 1259 },
            { x: 1537, y: 1259 },
            { x: 1537, y: 1817 },
            { x: 1437, y: 1817 },
            { x: 1437, y: 1985 },
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
            { x: 1244, y: 1001 },
            { x: 1556, y: 1001 },
            { x: 1556, y: 1927 },
            { x: 1451, y: 1927 },
            { x: 1451, y: 1929 },
            { x: 1437, y: 1929 },
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
            { x: 1451, y: 1827 },
            { x: 1451, y: 1971 },
            { x: 1682, y: 1971 },
            { x: 1682, y: 2751 },
          ],
        },
      },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.tinyInteriorDoglegs).toBe(2);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it.each([
    {
      id: 'e_md_erp',
      source: 'master-data',
      target: 'erp',
      path: [
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
    {
      id: 'e_move_inv',
      source: 'movement',
      target: 'inventory',
      path: [
        { x: 3872, y: 205 },
        { x: 3783, y: 205 },
        { x: 3783, y: 276 },
        { x: 2475, y: 276 },
        { x: 2475, y: 253 },
        { x: 2386, y: 253 },
      ],
    },
    {
      id: 'e_shipping_oms',
      source: 'shipping',
      target: 'oms',
      path: [
        { x: 7071, y: 506 },
        { x: 7071, y: 915 },
        { x: 5402, y: 915 },
        { x: 5402, y: 923 },
        { x: 255, y: 923 },
      ],
    },
  ])('collapses WMS tiny display stair on $id', ({ id, source, target, path }) => {
    const edges: Edge[] = [{
      id,
      source,
      target,
      data: { computedPath: path },
    }];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.tinyInteriorDoglegs).toBeGreaterThan(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

});
