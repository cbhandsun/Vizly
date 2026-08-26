import type { Edge, Node } from '@xyflow/react';
import type { RoutingPatch } from '../../routing/routingPatch';

import type {
  RoutingIdentity,
  RoutingWorkerSessionRef,
} from './baseReactFlowDisplayRoutingSession';
import {
  displayRoutingIdentitiesMatch,
  isDisplayRoutingWorkerSessionRef,
} from './baseReactFlowDisplayRoutingSession';
import {
  createDisplayRoutingTopologyPlan,
  type RoutingTopologyPlan,
} from './baseReactFlowDisplayRoutingTopologyPlan';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import {
  createDisplayRoutingWorkerSpatialSnapshot,
  type DisplayRoutingWorkerSpatialSnapshot,
} from './baseReactFlowDisplayWorkerSpatialSnapshot';

const MAX_WORKER_ROUTING_SESSIONS = 8;

export type DisplayRoutingWorkerSessionState = Readonly<{
  ref: RoutingWorkerSessionRef;
  nodes: Node[];
  sourceEdges: Edge[];
  displayPatches: RoutingPatch[];
  topologyPlan: RoutingTopologyPlan;
  spatialSnapshot: DisplayRoutingWorkerSpatialSnapshot | null;
  hardReport?: BaseDisplayBoundedCandidateReport;
}>;

const sessions = new Map<string, DisplayRoutingWorkerSessionState>();
let sessionSequence = 0;

const remember = (state: DisplayRoutingWorkerSessionState): void => {
  sessions.delete(state.ref.sessionId);
  sessions.set(state.ref.sessionId, state);
  while (sessions.size > MAX_WORKER_ROUTING_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (typeof oldest !== 'string') break;
    sessions.delete(oldest);
  }
};

export const writeDisplayRoutingWorkerSession = ({
  identity,
  outputRouteSignature,
  nodes,
  sourceEdges,
  displayPatches,
  finalEdges,
  hardReport,
}: {
  identity: RoutingIdentity;
  outputRouteSignature: string;
  nodes: Node[];
  sourceEdges: Edge[];
  displayPatches: RoutingPatch[];
  finalEdges: Edge[];
  hardReport?: BaseDisplayBoundedCandidateReport;
}): RoutingWorkerSessionRef => {
  sessionSequence = sessionSequence >= 9_999_999_999 ? 1 : sessionSequence + 1;
  const ref: RoutingWorkerSessionRef = {
    sessionId: `display-session-v1:${sessionSequence}`,
    identity,
    outputRouteSignature,
  };
  remember({
    ref,
    nodes,
    sourceEdges,
    displayPatches,
    topologyPlan: createDisplayRoutingTopologyPlan(nodes, finalEdges),
    spatialSnapshot: createDisplayRoutingWorkerSpatialSnapshot({
      nodes: withDisplayAbsolutePositions(
        nodes,
        new Map(nodes.map(node => [node.id, node] as const)),
      ),
      edges: finalEdges,
      outputRouteSignature,
    }),
    hardReport,
  });
  return ref;
};

export const readDisplayRoutingWorkerSession = ({
  ref,
  expectedIdentity,
  expectedOutputRouteSignature,
}: {
  ref: RoutingWorkerSessionRef | null | undefined;
  expectedIdentity: RoutingIdentity;
  expectedOutputRouteSignature: string;
}): DisplayRoutingWorkerSessionState | null => {
  if (
    !isDisplayRoutingWorkerSessionRef(ref)
    || !displayRoutingIdentitiesMatch(ref.identity, expectedIdentity)
    || ref.outputRouteSignature !== expectedOutputRouteSignature
  ) return null;
  const state = sessions.get(ref.sessionId);
  if (
    !state
    || !displayRoutingIdentitiesMatch(state.ref.identity, expectedIdentity)
    || state.ref.outputRouteSignature !== expectedOutputRouteSignature
  ) return null;
  remember(state);
  return state;
};

/**
 * Resolves only a Worker-private state whose full routing identity matches.
 * This intentionally accepts no caller-provided session id: it is used for
 * reversible topology edits that return to geometry already committed by the
 * same Worker realm.
 */
export const readDisplayRoutingWorkerSessionByIdentity = ({
  expectedIdentity,
}: {
  expectedIdentity: RoutingIdentity;
}): DisplayRoutingWorkerSessionState | null => {
  const states = [...sessions.values()];
  for (let index = states.length - 1; index >= 0; index -= 1) {
    const state = states[index];
    if (!displayRoutingIdentitiesMatch(state.ref.identity, expectedIdentity)) continue;
    remember(state);
    return state;
  }
  return null;
};

export const clearDisplayRoutingWorkerSessions = (): void => {
  sessions.clear();
  sessionSequence = 0;
};
