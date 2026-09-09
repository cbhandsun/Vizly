import type { Node } from '@xyflow/react';

import {
  classifyRectPeerHemisphere,
  geometryHemispheresAreOpposite,
  type GeometryHemisphere,
} from '../../strategies/shared/edgeSharedTrunkSynthesisUtils';
import { getDisplayNodeRect, type DisplayRect } from './baseReactFlowDisplayGeometry';

const finitePositiveRect = (rect: DisplayRect | null): rect is DisplayRect => (
  !!rect
  && Number.isFinite(rect.x)
  && Number.isFinite(rect.y)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
  && rect.width > 0
  && rect.height > 0
);

export const classifyDisplayPeerHemisphere = (
  hub: DisplayRect,
  peer: DisplayRect,
): GeometryHemisphere => classifyRectPeerHemisphere(hub, peer);

export const displayPeerHemispheresAreOpposite = (
  first: GeometryHemisphere,
  second: GeometryHemisphere,
): boolean => geometryHemispheresAreOpposite(first, second);

export const shouldSkipSharedSourceTrunkAcrossOppositeHemisphere = (
  nodesById: ReadonlyMap<string, Node>,
  sourceId: string,
  targetId: string,
  peerTargetId: string,
): boolean => {
  const hubNode = nodesById.get(sourceId);
  const targetNode = nodesById.get(targetId);
  const peerTargetNode = nodesById.get(peerTargetId);
  if (!hubNode || !targetNode || !peerTargetNode) return false;
  const hubRect = getDisplayNodeRect(hubNode);
  const targetRect = getDisplayNodeRect(targetNode);
  const peerTargetRect = getDisplayNodeRect(peerTargetNode);
  if (!finitePositiveRect(hubRect) || !finitePositiveRect(targetRect) || !finitePositiveRect(peerTargetRect)) {
    return false;
  }
  return displayPeerHemispheresAreOpposite(
    classifyDisplayPeerHemisphere(hubRect, targetRect),
    classifyDisplayPeerHemisphere(hubRect, peerTargetRect),
  );
};
