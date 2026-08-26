import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingRenderAuthority,
  displayRoutingRenderAuthorityAllowsEdge,
} from '../displayRoutingRenderAuthority';

const authority = () => createDisplayRoutingRenderAuthority({
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  hardReportDigest: 'hard-report-v1:0123456789abcdef',
  authorizedEdgeIds: ['edge-a', 'edge-b'],
});

describe('displayRoutingRenderAuthority', () => {
  it('authorizes only listed edges on a realm-issued committed capability', () => {
    const issued = authority();
    expect(issued).not.toBeNull();
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, 'edge-a')).toBe(true);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, 'edge-c')).toBe(false);
    expect(displayRoutingRenderAuthorityAllowsEdge({ ...issued }, 'edge-a')).toBe(false);
  });

  it.each([
    { inputSignature: 'not-a-signature' },
    { inputGeometryDigest: 'geometry-v1:short' },
    { outputRouteSignature: 'route-v2:forged' },
    { hardReportDigest: 'hard-report-v1:forged' },
    { authorizedEdgeIds: [] },
    { authorizedEdgeIds: [''] },
    { authorizedEdgeIds: Array.from({ length: 301 }, (_, index) => `edge-${index}`) },
  ])('fails closed for malformed or oversized authority input: %j', override => {
    expect(createDisplayRoutingRenderAuthority({
      inputSignature: '1234',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      hardReportDigest: 'hard-report-v1:0123456789abcdef',
      authorizedEdgeIds: ['edge-a'],
      ...override,
    })).toBeNull();
  });
});
