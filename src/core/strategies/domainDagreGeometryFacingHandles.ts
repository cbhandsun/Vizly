import { normalizeHandle } from '../routing/utils/handleUtils';
import {
  routingNodeAbsolutePosition,
  routingNodeSize,
  type RoutingNode,
} from './domainDagreEdgePreparationSupport';

export type DomainDagreGeometryFacingHandles = Readonly<{
  sourceHandle: 'left' | 'right' | 'top' | 'bottom';
  targetHandle: 'left' | 'right' | 'top' | 'bottom';
}>;

export const resolveDomainDagreGeometryFacingHandles = (
  source: RoutingNode,
  target: RoutingNode,
): DomainDagreGeometryFacingHandles | null => {
  const sourcePosition = routingNodeAbsolutePosition(source);
  const targetPosition = routingNodeAbsolutePosition(target);
  const sourceSize = routingNodeSize(source);
  const targetSize = routingNodeSize(target);
  const dx = (targetPosition.x + targetSize.width / 2)
    - (sourcePosition.x + sourceSize.width / 2);
  const dy = (targetPosition.y + targetSize.height / 2)
    - (sourcePosition.y + sourceSize.height / 2);
  if (Math.abs(dx) >= Math.abs(dy) * 1.1 && Math.abs(dx) > 40) {
    return dx > 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  }
  if (Math.abs(dy) > 40) {
    return dy > 0
      ? { sourceHandle: 'bottom', targetHandle: 'top' }
      : { sourceHandle: 'top', targetHandle: 'bottom' };
  }
  return null;
};

const normalizeOptionalHandle = (handle: unknown): ReturnType<typeof normalizeHandle> => (
  typeof handle === 'string' ? normalizeHandle(handle) : normalizeHandle(null)
);

export const domainDagreRouteHandleFacesGeometry = (
  sourceHandle: unknown,
  targetHandle: unknown,
  facing: DomainDagreGeometryFacingHandles | null,
): boolean => !facing || (
  normalizeOptionalHandle(sourceHandle) === normalizeHandle(facing.sourceHandle)
  && normalizeOptionalHandle(targetHandle) === normalizeHandle(facing.targetHandle)
);

const handleAxis = (handle: unknown): 'horizontal' | 'vertical' | null => {
  const normalized = normalizeOptionalHandle(handle);
  if (normalized === 'l' || normalized === 'r') return 'horizontal';
  if (normalized === 't' || normalized === 'b') return 'vertical';
  return null;
};

export const domainDagreRouteHandleNeedsGeometryFlip = (
  sourceHandle: unknown,
  targetHandle: unknown,
  facing: DomainDagreGeometryFacingHandles | null,
): boolean => {
  if (!facing || domainDagreRouteHandleFacesGeometry(sourceHandle, targetHandle, facing)) return false;
  const sourceAxis = handleAxis(sourceHandle);
  const targetAxis = handleAxis(targetHandle);
  const facingAxis = handleAxis(facing.sourceHandle);
  return sourceAxis !== null
    && sourceAxis === targetAxis
    && sourceAxis === facingAxis;
};
