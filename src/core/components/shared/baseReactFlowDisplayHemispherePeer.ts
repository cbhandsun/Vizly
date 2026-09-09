import type { Node } from '@xyflow/react';

import { getDisplayNodeRect, type DisplayRect } from './baseReactFlowDisplayGeometry';

type DisplayHemisphere = 'top' | 'bottom' | 'left' | 'right';

const HEMISPHERE_RATIO = 1.35;
const HEMISPHERE_MIN_OFFSET = 24;

const centerOf = (rect: DisplayRect): { x: number; y: number } => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

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
): DisplayHemisphere => {
  const hubCenter = centerOf(hub);
  const peerCenter = centerOf(peer);
  const dx = peerCenter.x - hubCenter.x;
  const dy = peerCenter.y - hubCenter.y;
  if (Math.abs(dx) > Math.abs(dy) * HEMISPHERE_RATIO && Math.abs(dx) > HEMISPHERE_MIN_OFFSET) {
    return dx < 0 ? 'left' : 'right';
  }
  if (Math.abs(dy) > HEMISPHERE_MIN_OFFSET) return dy < 0 ? 'top' : 'bottom';
  return Math.abs(dx) >= Math.abs(dy)
    ? (dx < 0 ? 'left' : 'right')
    : (dy < 0 ? 'top' : 'bottom');
};

export const displayPeerHemispheresAreOpposite = (
  first: DisplayHemisphere,
  second: DisplayHemisphere,
): boolean => (
  (first === 'top' && second === 'bottom')
  || (first === 'bottom' && second === 'top')
  || (first === 'left' && second === 'right')
  || (first === 'right' && second === 'left')
);

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
