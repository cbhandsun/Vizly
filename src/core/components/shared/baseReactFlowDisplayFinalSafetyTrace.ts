import type { Edge } from '@xyflow/react';

import {
  diffBaseReactFlowEvaluationMetrics,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseName,
  type DisplayRoutingPhaseResolution,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export type BaseReactFlowFinalSafetyTraceOptions = Readonly<{
  evaluation?: BaseReactFlowFinalEndpointEvaluation;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  traceParentPhase?: Extract<
    DisplayRoutingPhaseName,
    'final-safety-closure' | 'final-commercial-safety-closure'
  >;
}>;

export type BaseReactFlowFinalSafetyRepairPhase = Extract<
  DisplayRoutingPhaseName,
  | 'final-safety-repair-baseline'
  | 'final-safety-repair-clearance'
  | 'final-safety-repair-hard'
  | 'final-safety-repair-trunks'
  | 'final-safety-repair-bundles'
  | 'final-safety-repair-corridors'
  | 'final-safety-repair-skirts'
  | 'final-safety-repair-strict'
  | 'final-safety-repair-micro'
  | 'final-safety-repair-stubs'
  | 'final-safety-repair-order'
  | 'final-safety-repair-order-hard'
  | 'final-safety-repair-order-strict'
  | 'final-safety-repair-order-finish'
  | 'final-safety-repair-terminal'
>;

export const startBaseReactFlowFinalSafetyRepairStage = (
  baseline: readonly Edge[],
  options: BaseReactFlowFinalSafetyTraceOptions,
  phase: BaseReactFlowFinalSafetyRepairPhase,
) => {
  const metricsBefore = options.evaluation?.readMetrics();
  const timer = startDisplayRoutingPhaseTrace({
    phase,
    parentPhase: options.traceParentPhase ?? 'final-safety-closure',
    candidateCount: 0,
    onTrace: options.onPhaseTrace,
  });
  return {
    finish: (
      resolution: DisplayRoutingPhaseResolution,
      candidateCount: number,
      candidate?: readonly Edge[],
    ): void => timer.finish(
      resolution,
      candidate ? countChangedRoutingItems(baseline, candidate) : 0,
      {
        candidateCount,
        ...(metricsBefore && options.evaluation
          ? diffBaseReactFlowEvaluationMetrics(
            metricsBefore,
            options.evaluation.readMetrics(),
          )
          : {}),
      },
    ),
  };
};
