import { EDGE_ROUTING_WORKER_PROTOCOL_VERSION } from '../../routing/routingVersion';
import {
  cloneDisplayRoutingWorkerSessionRef,
  createDisplayRoutingIdentity,
  displayRoutingIdentitiesMatch,
  isDisplayRoutingIdentity,
  isDisplayRoutingWorkerSessionRef,
  type RoutingIdentity,
  type RoutingWorkerSessionRef,
} from '../../routing/routingSessionIdentity';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  computeDisplayRoutingHardReportDigest,
  isDisplayRoutingHardReportDigest,
  type DisplayRoutingHardReportDigest,
} from './baseReactFlowDisplayHardReportDigest';
import { isDisplayWorkerBoundedCandidateReport } from './baseReactFlowDisplayWorkerQualityProtocol';

const OUTPUT_ROUTE_SIGNATURE_PATTERN = /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/;

export type DisplayRoutingWorkerCommitReceipt = Readonly<{
  schema: 'vizly-routing-session-commit-v1';
  protocolVersion: typeof EDGE_ROUTING_WORKER_PROTOCOL_VERSION;
  identity: RoutingIdentity;
  outputRouteSignature: string;
  hardReport: BaseDisplayBoundedCandidateReport;
  hardReportDigest: DisplayRoutingHardReportDigest;
  sessionRef: RoutingWorkerSessionRef;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const copyDisplayRoutingHardReport = (
  report: BaseDisplayBoundedCandidateReport,
): BaseDisplayBoundedCandidateReport => {
  const clearanceEdgeIds = report.minimumClearanceViolationEdgeIds
    ? [...report.minimumClearanceViolationEdgeIds]
    : undefined;
  if (clearanceEdgeIds) Object.freeze(clearanceEdgeIds);
  return Object.freeze({
    candidate: report.candidate,
    hardClean: report.hardClean,
    obstacleHits: report.obstacleHits,
    terminalsAttached: report.terminalsAttached,
    terminalsAnchored: report.terminalsAnchored,
    quality: Object.freeze({ ...report.quality }),
    ...(typeof report.minimumClearanceViolations === 'number'
      ? { minimumClearanceViolations: report.minimumClearanceViolations }
      : {}),
    ...(clearanceEdgeIds
      ? { minimumClearanceViolationEdgeIds: clearanceEdgeIds }
      : {}),
    ...(typeof report.commercialClearanceViolations === 'number'
      ? { commercialClearanceViolations: report.commercialClearanceViolations }
      : {}),
  });
};

export const createDisplayRoutingWorkerCommitReceipt = ({
  identity,
  outputRouteSignature,
  hardReport,
  sessionRef,
}: {
  identity: RoutingIdentity;
  outputRouteSignature: string;
  hardReport: BaseDisplayBoundedCandidateReport;
  sessionRef: RoutingWorkerSessionRef;
}): DisplayRoutingWorkerCommitReceipt | null => {
  if (
    !isDisplayRoutingIdentity(identity)
    || !OUTPUT_ROUTE_SIGNATURE_PATTERN.test(outputRouteSignature)
    || !isDisplayWorkerBoundedCandidateReport(hardReport)
    || !hardReport.hardClean
    || !isDisplayRoutingWorkerSessionRef(sessionRef)
    || !displayRoutingIdentitiesMatch(sessionRef.identity, identity)
    || sessionRef.outputRouteSignature !== outputRouteSignature
  ) return null;
  const safeIdentity = createDisplayRoutingIdentity(
    identity.inputSignature,
    identity.inputGeometryDigest,
  );
  const safeHardReport = copyDisplayRoutingHardReport(hardReport);
  return Object.freeze({
    schema: 'vizly-routing-session-commit-v1',
    protocolVersion: EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
    identity: safeIdentity,
    outputRouteSignature,
    hardReport: safeHardReport,
    hardReportDigest: computeDisplayRoutingHardReportDigest(safeHardReport),
    sessionRef: cloneDisplayRoutingWorkerSessionRef(sessionRef),
  });
};

export const parseDisplayRoutingWorkerCommitReceipt = (
  value: unknown,
): DisplayRoutingWorkerCommitReceipt | null => {
  if (!isRecord(value) || Object.keys(value).length !== 7) return null;
  if (
    value.schema !== 'vizly-routing-session-commit-v1'
    || value.protocolVersion !== EDGE_ROUTING_WORKER_PROTOCOL_VERSION
    || !isDisplayRoutingIdentity(value.identity)
    || !OUTPUT_ROUTE_SIGNATURE_PATTERN.test(String(value.outputRouteSignature ?? ''))
    || !isDisplayWorkerBoundedCandidateReport(value.hardReport)
    || !value.hardReport.hardClean
    || !isDisplayRoutingHardReportDigest(value.hardReportDigest)
    || computeDisplayRoutingHardReportDigest(value.hardReport) !== value.hardReportDigest
    || !isDisplayRoutingWorkerSessionRef(value.sessionRef)
    || !displayRoutingIdentitiesMatch(value.sessionRef.identity, value.identity)
    || value.sessionRef.outputRouteSignature !== value.outputRouteSignature
  ) return null;
  return createDisplayRoutingWorkerCommitReceipt({
    identity: value.identity,
    outputRouteSignature: value.outputRouteSignature as string,
    hardReport: value.hardReport,
    sessionRef: value.sessionRef,
  });
};
