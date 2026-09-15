import { parseDisplayWorkerTimingMetadata } from './baseReactFlowDisplayWorkerExecutionTiming';
import { parseDisplayWorkerEligibleScope } from './baseReactFlowDisplayWorkerEligibleScope';
import { isDisplayWorkerBoundedCandidateReport } from './baseReactFlowDisplayWorkerQualityProtocol';
import {
  isDisplayRoutingPhaseTrace,
  parseDisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayWorkerTraceProtocol';
import {
  displayRoutingIdentitiesMatch,
  isDisplayRoutingIdentity,
  isDisplayRoutingWorkerSessionRef,
} from './baseReactFlowDisplayRoutingSession';
import { parseDisplayRoutingWorkerCommitReceipt } from './baseReactFlowDisplayWorkerCommitReceipt';
import { computeDisplayRoutingHardReportDigest } from './baseReactFlowDisplayHardReportDigest';
import { isDisplayRoutingContractSummary } from './baseReactFlowDisplayRoutingContract';
import {
  DISPLAY_WORKER_MAX_GRAPH_ITEMS,
  hasFinalDisplayWorkerResponseMetadata,
  isDisplayEdgesWorkerEdgeList,
  isRecord,
  OUTPUT_ROUTE_SIGNATURE_PATTERN,
} from './baseReactFlowDisplayWorkerProtocol';
export const diagnoseDisplayEdgesWorkerResponseProtocolFailure = (
  value: unknown,
  expectedRequestId: string,
): string | null => {
  if (!isRecord(value)) return 'not-record';
  if (value.requestId !== expectedRequestId) return 'request-id-mismatch';
  const hasError = typeof value.error !== 'undefined';
  const hasBoundedCandidate = typeof value.boundedCandidate !== 'undefined';
  const hasEdges = typeof value.edges !== 'undefined';
  const hasRoutingPatches = typeof value.routingPatches !== 'undefined';
  const hasPhaseProgress = typeof value.phaseProgress !== 'undefined';
  if (
    Number(hasError)
    + Number(hasBoundedCandidate)
    + Number(hasEdges)
    + Number(hasRoutingPatches)
    + Number(hasPhaseProgress) !== 1
  ) return 'ambiguous-response-shape';
  if (parseDisplayWorkerEligibleScope(value) === null) return 'invalid-eligible-scope';
  if (typeof value.workerExecutionTiming !== 'undefined'
    && !(hasEdges || hasRoutingPatches)) return 'invalid-worker-timing-placement';
  if (hasError) {
    if (hasFinalDisplayWorkerResponseMetadata(value)) return 'error-with-final-metadata';
    return typeof value.error === 'string' && value.error.length > 0 && value.error.length <= 256
      ? null
      : 'invalid-error';
  }
  if (hasBoundedCandidate) {
    if (hasFinalDisplayWorkerResponseMetadata(value)) return 'candidate-with-final-metadata';
    return isDisplayWorkerBoundedCandidateReport(value.boundedCandidate)
      ? null
      : 'invalid-bounded-candidate';
  }
  if (hasPhaseProgress) {
    if (hasFinalDisplayWorkerResponseMetadata(value)) return 'progress-with-final-metadata';
    return isDisplayRoutingPhaseTrace(value.phaseProgress)
      ? null
      : 'invalid-phase-progress';
  }
  const finalEdges = hasEdges ? value.edges : value.routingPatches;
  if (!isDisplayEdgesWorkerEdgeList(finalEdges)) return 'invalid-edge-list';
  const phaseTrace = typeof value.phaseTrace === 'undefined'
    ? []
    : parseDisplayRoutingPhaseTrace(value.phaseTrace);
  if (!phaseTrace) return 'invalid-phase-trace';
  if (typeof value.hardReport === 'undefined') return 'missing-hard-report';
  if (!isDisplayWorkerBoundedCandidateReport(value.hardReport)) return 'invalid-hard-report';
  const routingContract = typeof value.routingContract === 'undefined'
    ? undefined
    : (isDisplayRoutingContractSummary(value.routingContract) ? value.routingContract : null);
  if (routingContract === null) return 'invalid-routing-contract';
  if (parseDisplayWorkerTimingMetadata(value) === null) return 'invalid-worker-timing';
  const hasIncrementalMetadata = typeof value.affectedEdgeCount !== 'undefined'
    || typeof value.fallbackLevel !== 'undefined';
  const incrementalMetadataIsValid = !hasIncrementalMetadata || (
    Number.isSafeInteger(value.affectedEdgeCount)
    && (value.affectedEdgeCount as number) >= 0
    && (value.affectedEdgeCount as number) <= DISPLAY_WORKER_MAX_GRAPH_ITEMS
    && (value.fallbackLevel === 'none' || value.fallbackLevel === 'full')
  );
  if (!incrementalMetadataIsValid) return 'invalid-incremental-metadata';
  const hasSessionMetadata = typeof value.nextIdentity !== 'undefined'
    || typeof value.outputRouteSignature !== 'undefined'
    || typeof value.sessionRef !== 'undefined'
    || typeof value.commitReceipt !== 'undefined';
  const commitReceipt = typeof value.commitReceipt === 'undefined'
    ? undefined
    : parseDisplayRoutingWorkerCommitReceipt(value.commitReceipt);
  const sessionMetadataIsValid = !hasSessionMetadata || (
    isDisplayRoutingIdentity(value.nextIdentity)
    && OUTPUT_ROUTE_SIGNATURE_PATTERN.test(String(value.outputRouteSignature ?? ''))
    && isDisplayRoutingWorkerSessionRef(value.sessionRef)
    && displayRoutingIdentitiesMatch(value.sessionRef.identity, value.nextIdentity)
    && value.sessionRef.outputRouteSignature === value.outputRouteSignature
    && commitReceipt !== null
    && (
      typeof commitReceipt === 'undefined'
      || (
        displayRoutingIdentitiesMatch(commitReceipt.identity, value.nextIdentity)
        && commitReceipt.outputRouteSignature === value.outputRouteSignature
        && commitReceipt.sessionRef.sessionId === value.sessionRef.sessionId
        && commitReceipt.hardReportDigest
          === computeDisplayRoutingHardReportDigest(value.hardReport)
      )
    )
  );
  if (!sessionMetadataIsValid) return 'invalid-session-metadata';
  if (typeof value.hardClean !== 'boolean') return 'invalid-hard-clean';
  if (value.hardReport.hardClean !== value.hardClean) return 'hard-clean-mismatch';
  if (
    value.routeResolution !== 'validated-candidate'
    && value.routeResolution !== 'repaired-candidate'
    && value.routeResolution !== 'incremental-route'
    && value.routeResolution !== 'full-route'
    && value.routeResolution !== 'full-route-repaired'
    && value.routeResolution !== 'repair'
  ) return 'invalid-route-resolution';
  return null;
};


