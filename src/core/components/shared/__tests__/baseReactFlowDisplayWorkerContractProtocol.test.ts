import { describe, expect, it } from 'vitest';

import { parseDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

const cleanHardReport = createTestDisplayHardReport();
const cleanRoutingContract = {
  clean: true,
  hardClean: true,
  violationCount: 0,
  violations: [],
};

describe('display worker routing contract protocol', () => {
  it('bounds routing contract summaries at the Worker response boundary', () => {
    const response = {
      requestId: 'contract',
      edges: [],
      hardClean: true,
      hardReport: cleanHardReport,
      routingContract: cleanRoutingContract,
      routeResolution: 'full-route',
    };

    expect(parseDisplayEdgesWorkerResponse(response, 'contract')?.routingContract)
      .toEqual(cleanRoutingContract);
    expect(parseDisplayEdgesWorkerResponse({
      ...response,
      routingContract: {
        ...cleanRoutingContract,
        clean: false,
      },
    }, 'contract')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      ...response,
      routingContract: {
        clean: false,
        hardClean: false,
        violationCount: 1,
        violations: [{
          code: 'commercial-clearance',
          phase: 'clearance',
          severity: 'commercial',
          count: 1,
          edgeIds: ['edge'],
        }],
      },
    }, 'contract')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'contract',
      error: 'failed',
      routingContract: cleanRoutingContract,
    }, 'contract')).toBeNull();
  });
});
