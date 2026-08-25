import { BASE_DISPLAY_ROUTING_VERSION } from './baseReactFlowDisplayCache';
import { EDGE_ROUTING_VISUAL_VERSION } from '../../routing/routingVersion';
import { isBaseReactFlowDisplayGeometryDigest } from './baseReactFlowDisplayInputIdentity';
import { isBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';

const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;
const SESSION_ID_PATTERN = /^display-session-v1:[1-9]\d{0,9}$/;

export type RoutingIdentity = Readonly<{
  routingVersion: string;
  visualVersion: string;
  inputSignature: string;
  inputGeometryDigest: string;
}>;

export type RoutingWorkerSessionRef = Readonly<{
  sessionId: string;
  identity: RoutingIdentity;
  outputRouteSignature: string;
}>;

export const createDisplayRoutingIdentity = (
  inputSignature: string,
  inputGeometryDigest: string,
): RoutingIdentity => ({
  routingVersion: BASE_DISPLAY_ROUTING_VERSION,
  visualVersion: EDGE_ROUTING_VISUAL_VERSION,
  inputSignature,
  inputGeometryDigest,
});

export const isDisplayRoutingIdentity = (value: unknown): value is RoutingIdentity => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  return Object.keys(identity).length === 4
    && identity.routingVersion === BASE_DISPLAY_ROUTING_VERSION
    && identity.visualVersion === EDGE_ROUTING_VISUAL_VERSION
    && typeof identity.inputSignature === 'string'
    && INPUT_SIGNATURE_PATTERN.test(identity.inputSignature)
    && isBaseReactFlowDisplayGeometryDigest(identity.inputGeometryDigest);
};

export const isDisplayRoutingWorkerSessionRef = (
  value: unknown,
): value is RoutingWorkerSessionRef => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return Object.keys(ref).length === 3
    && typeof ref.sessionId === 'string'
    && SESSION_ID_PATTERN.test(ref.sessionId)
    && isDisplayRoutingIdentity(ref.identity)
    && isBaseReactFlowDisplayOutputRouteSignature(ref.outputRouteSignature);
};

export const displayRoutingIdentitiesMatch = (
  first: RoutingIdentity,
  second: RoutingIdentity,
): boolean => (
  first.routingVersion === second.routingVersion
  && first.visualVersion === second.visualVersion
  && first.inputSignature === second.inputSignature
  && first.inputGeometryDigest === second.inputGeometryDigest
);
