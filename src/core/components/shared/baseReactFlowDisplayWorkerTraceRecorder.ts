import { DISPLAY_ROUTING_PHASE_TRACE_LIMIT } from './baseReactFlowDisplayRoutingTrace';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

export const appendDisplayRoutingPhaseTrace = (
  phaseTrace: DisplayRoutingPhaseTrace[],
  trace: DisplayRoutingPhaseTrace,
): boolean => {
  if (phaseTrace.length >= DISPLAY_ROUTING_PHASE_TRACE_LIMIT) return false;
  phaseTrace.push(trace);
  return true;
};

export const createDisplayRoutingPhaseRecorder = ({
  requestId,
  phaseTrace,
  publish,
  publishProgress = true,
}: {
  requestId: string;
  phaseTrace: DisplayRoutingPhaseTrace[];
  publish: (response: DisplayEdgesWorkerResponse) => void;
  publishProgress?: boolean;
}): ((trace: DisplayRoutingPhaseTrace) => void) => (trace) => {
  appendDisplayRoutingPhaseTrace(phaseTrace, trace);
  if (publishProgress) publish({ requestId, phaseProgress: trace });
};

export const createDisplayRoutingFallbackMetadata = (
  request: DisplayEdgesWorkerRequest,
  affectedEdgeCount: number | undefined,
): Readonly<{ affectedEdgeCount?: number; fallbackLevel?: 'full' }> => (
  request.operation === 'incremental-route'
    ? { affectedEdgeCount: affectedEdgeCount ?? 0, fallbackLevel: 'full' }
    : {}
);
