import { describe, expect, it } from 'vitest';

import {
  cloneDisplayRoutingWorkerSessionRef,
  createDisplayRoutingIdentity,
  displayRoutingIdentitiesMatch,
  isDisplayRoutingIdentity,
  isDisplayRoutingWorkerSessionRef,
} from '../routingSessionIdentity';

const geometryDigest = `geometry-v1:${'a'.repeat(32)}`;
const outputRouteSignature = 'route-v2:1:2:0123456789abcdef';

describe('routingSessionIdentity', () => {
  it('creates and clones immutable current-version session identities', () => {
    const identity = createDisplayRoutingIdentity('1234', geometryDigest);
    const source = {
      sessionId: 'display-session-v1:1',
      identity,
      outputRouteSignature,
    };
    const cloned = cloneDisplayRoutingWorkerSessionRef(source);

    expect(isDisplayRoutingIdentity(identity)).toBe(true);
    expect(isDisplayRoutingWorkerSessionRef(cloned)).toBe(true);
    expect(displayRoutingIdentitiesMatch(identity, cloned.identity)).toBe(true);
    expect(cloned).not.toBe(source);
    expect(cloned.identity).not.toBe(identity);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(cloned)).toBe(true);
    expect(Object.isFrozen(cloned.identity)).toBe(true);
  });

  it.each([
    null,
    {},
    [],
    { routingVersion: 'old', visualVersion: 'old', inputSignature: '1234', inputGeometryDigest: geometryDigest },
    { ...createDisplayRoutingIdentity('1234', geometryDigest), inputSignature: '' },
    { ...createDisplayRoutingIdentity('1234', geometryDigest), inputSignature: '12345678901' },
    { ...createDisplayRoutingIdentity('1234', geometryDigest), inputGeometryDigest: 'geometry-v1:short' },
    { ...createDisplayRoutingIdentity('1234', geometryDigest), extra: true },
  ])('rejects malformed or version-conflicting identity input: %j', value => {
    expect(isDisplayRoutingIdentity(value)).toBe(false);
  });

  it.each([
    null,
    {},
    [],
    { sessionId: 'display-session-v1:0', identity: createDisplayRoutingIdentity('1234', geometryDigest), outputRouteSignature },
    { sessionId: 'display-session-v1:1', identity: {}, outputRouteSignature },
    { sessionId: 'display-session-v1:1', identity: createDisplayRoutingIdentity('1234', geometryDigest), outputRouteSignature: 'route-v2:invalid' },
    { sessionId: 'display-session-v1:1', identity: createDisplayRoutingIdentity('1234', geometryDigest), outputRouteSignature, extra: true },
  ])('rejects malformed, empty, or over-specified Worker session input: %j', value => {
    expect(isDisplayRoutingWorkerSessionRef(value)).toBe(false);
  });
});
