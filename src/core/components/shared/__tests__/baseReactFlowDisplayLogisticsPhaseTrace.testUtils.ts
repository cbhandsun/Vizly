import { expect } from 'vitest';

import type { DisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';

const terminalTraceExpectedParents: Readonly<Record<string, string>> = {
  'terminal-attachment-axis': 'terminal',
  'terminal-anchor': 'terminal',
  'terminal-polish': 'terminal',
  'terminal-finalize': 'terminal',
  'terminal-finalize-orthogonal': 'terminal-finalize',
  'terminal-finalize-axis': 'terminal-finalize',
  'terminal-finalize-outer-port': 'terminal-finalize',
  'terminal-finalize-fail-closed': 'terminal-finalize',
  'terminal-fail-closed-normalize': 'terminal-finalize-fail-closed',
  'terminal-fail-closed-overlap': 'terminal-finalize-fail-closed',
  'terminal-fail-closed-local': 'terminal-finalize-fail-closed',
  'terminal-fail-closed-strict': 'terminal-finalize-fail-closed',
  'terminal-fail-closed-selection': 'terminal-finalize-fail-closed',
  'terminal-fail-closed-micro': 'terminal-finalize-fail-closed',
  'terminal-fail-closed-gate': 'terminal-finalize-fail-closed',
};

export const expectDisplayRoutingTraceChildren = (
  phaseTrace: DisplayEdgesWorkerResponse['phaseTrace'],
  diagnostics: string,
  parentPhase: string,
  childPrefix: string,
): void => {
  expect(phaseTrace, diagnostics).toBeDefined();
  const matchingTraces = phaseTrace?.filter(trace => trace.phase.startsWith(childPrefix)) ?? [];
  const expectedParents = parentPhase === 'terminal' && childPrefix === 'terminal-'
    ? terminalTraceExpectedParents
    : undefined;
  expect(matchingTraces.every(trace => {
    const expectedParent = expectedParents?.[trace.phase] ?? parentPhase;
    return (
      trace.parentPhase === expectedParent
      && Number.isFinite(trace.exclusiveDurationMs)
      && (!expectedParents || trace.phase in expectedParents)
    );
  }), diagnostics).toBe(true);
};

export const expectCompleteLogisticsIncrementalPhaseTrace = (
  phaseTrace: DisplayEdgesWorkerResponse['phaseTrace'],
  diagnostics: string,
): void => {
  const traces = phaseTrace ?? [];
  const phases = traces.map(trace => trace.phase);
  expect(phases, diagnostics).toEqual(expect.arrayContaining([
    'incremental-closure',
    'local-route',
    'hard-gate',
    'final-clearance',
    'final-hard-safety',
    'final-safety-hard-gate',
    'final-safety-stubs',
    'final-safety-endpoint-order',
    'final-safety-passage-order',
    'final-safety-closure',
    'final-endpoint-seed',
    'final-endpoint-topology',
    'final-endpoint-order',
    'final-endpoint-closure',
    'final-commercial-clearance',
    'final-commercial-terminal-preserving',
    'final-commercial-terminal-changing',
    'final-commercial-source-stairs',
    'final-commercial-evaluation',
    'final-commercial-safety-closure',
    'finalizer',
    'session-commit',
  ]));
  const firstEndpointAudit = phases.indexOf('final-safety-endpoint-order');
  const firstEndpointSeed = phases.indexOf('final-endpoint-seed');
  expect(firstEndpointAudit, diagnostics).toBeGreaterThan(-1);
  expect(firstEndpointAudit, diagnostics).toBeLessThan(firstEndpointSeed);

  const initialEndpointAudit = traces[firstEndpointAudit];
  const initialPassageAudit = traces.find(
    trace => trace.phase === 'final-safety-passage-order',
  );
  const endpointSeeds = traces.filter(trace => trace.phase === 'final-endpoint-seed');
  if (
    initialEndpointAudit?.resolution === 'accepted'
    && initialPassageAudit?.resolution === 'accepted'
  ) {
    expect(endpointSeeds, diagnostics).toHaveLength(1);
    expect(endpointSeeds[0]?.resolution, diagnostics).toBe('skip');
    return;
  }
  expect(
    [initialEndpointAudit?.resolution, initialPassageAudit?.resolution],
    diagnostics,
  ).toContain('rejected');
  expect(endpointSeeds, diagnostics).toHaveLength(1);
  expect(endpointSeeds[0]?.resolution, diagnostics).not.toBe('skip');
  const finalizerCandidateCount = traces.find(trace => trace.phase === 'finalizer')
    ?.candidateCount ?? 0;
  expect(endpointSeeds[0]?.candidateCount, diagnostics)
    .toBeGreaterThan(finalizerCandidateCount);
};
