import { describe, expect, it } from 'vitest';

import { buildOuterPortTerminalStubPlan } from '../baseReactFlowDisplayOuterPortStubProfiles';

describe('outer port terminal stub profiles', () => {
  it('prefers a 56px target stub when only the target keeps its declared side', () => {
    expect(buildOuterPortTerminalStubPlan(48, 'top', 'right', 'left', 'right')).toEqual({
      preferred: [
        { sourceStub: 48, targetStub: 56 },
        { sourceStub: 48, targetStub: 48 },
      ],
      fallback: [],
    });
  });

  it('bounds the normal both-declared search to three profiles', () => {
    const plan = buildOuterPortTerminalStubPlan(48, 'top', 'right', 'top', 'right');

    expect(plan.preferred).toEqual([
      { sourceStub: 56, targetStub: 56 },
      { sourceStub: 56, targetStub: 48 },
      { sourceStub: 48, targetStub: 56 },
    ]);
    expect(plan.fallback).toEqual([{ sourceStub: 48, targetStub: 48 }]);
  });

  it('keeps a regular profile for switched terminals and larger caller minima', () => {
    expect(buildOuterPortTerminalStubPlan(48, 'top', 'left', 'bottom', 'right')).toEqual({
      preferred: [{ sourceStub: 48, targetStub: 48 }],
      fallback: [],
    });
    expect(buildOuterPortTerminalStubPlan(64, 'top', 'right', 'top', 'right')).toEqual({
      preferred: [{ sourceStub: 64, targetStub: 64 }],
      fallback: [],
    });
  });

  it.each([
    [0, 'top', 'right', 'top', 'right'],
    [Number.NaN, 'top', 'right', 'top', 'right'],
    [48, 'diagonal', 'right', 'top', 'right'],
    [48, 'top', 'right', 'diagonal', 'right'],
  ] as const)('rejects invalid boundary input %#', (minimum, source, target, declaredSource, declaredTarget) => {
    expect(buildOuterPortTerminalStubPlan(
      minimum,
      source as any,
      target,
      declaredSource as any,
      declaredTarget,
    )).toEqual({ preferred: [], fallback: [] });
  });
});
