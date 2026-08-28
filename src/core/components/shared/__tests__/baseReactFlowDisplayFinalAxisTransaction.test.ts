import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { runFinalAxisTransaction } from '../baseReactFlowDisplayFinalAxisTransaction';

describe('runFinalAxisTransaction', () => {
  it.each([
    { terminalsAttached: false, terminalsAnchored: false },
    { terminalsAttached: true, terminalsAnchored: true },
  ])('does not rewrite terminals outside the attached-but-unanchored state: %o', (terminalState) => {
    const attachedCandidate: Edge[] = [];
    const orthogonalCandidate: Edge[] = [];
    const result = runFinalAxisTransaction({
      attachedCandidate,
      orthogonalCandidate,
      attachedReport: {
        ...terminalState,
        hardClean: false,
      } as BaseDisplayBoundedCandidateReport,
      evaluationSession: createBaseReactFlowFinalEndpointEvaluation([]),
      repairNodes: [],
      inputSignature: 'signature',
    });

    expect(result).toEqual({ finalized: null, anchoredFallback: null });
    expect(attachedCandidate).toEqual([]);
    expect(orthogonalCandidate).toEqual([]);
  });
});
