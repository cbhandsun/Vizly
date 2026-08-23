const DESIGNER_NODE_DRAG_SETTLE_MS = 300;
const DESIGNER_NODE_DRAG_SETTLE_WATCHDOG_MS = 500;
const MAX_DESIGNER_NODE_ID_LENGTH = 1_024;

export type DesignerNodeDragVisualSettleRef = {
  current: {
    minimumHandle: number;
    watchdogHandle: number;
    nodeId: string;
    minimumElapsed: boolean;
    routingFinalApplied: boolean;
    onSettled: () => void;
  } | null;
};

const safeNodeId = (value: unknown): string | null => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= MAX_DESIGNER_NODE_ID_LENGTH
    ? value
    : null
);

const findNodeElement = (nodeId: string): Element | null => {
  if (typeof document === 'undefined') return null;
  return Array.from(document.querySelectorAll('[data-id]'))
    .find(element => element.getAttribute('data-id') === nodeId) ?? null;
};

export const cancelDesignerNodeDragVisualSettle = (
  timerRef: DesignerNodeDragVisualSettleRef,
): void => {
  const pending = timerRef.current;
  if (!pending) return;
  if (typeof window !== 'undefined') {
    window.clearTimeout(pending.minimumHandle);
    window.clearTimeout(pending.watchdogHandle);
  }
  findNodeElement(pending.nodeId)?.classList.remove('just-dropped');
  timerRef.current = null;
};

const finishDesignerNodeDragVisualSettle = (
  timerRef: DesignerNodeDragVisualSettleRef,
  pending: NonNullable<DesignerNodeDragVisualSettleRef['current']>,
): void => {
  if (timerRef.current !== pending) return;
  window.clearTimeout(pending.minimumHandle);
  window.clearTimeout(pending.watchdogHandle);
  findNodeElement(pending.nodeId)?.classList.remove('just-dropped');
  timerRef.current = null;
  pending.onSettled();
};

const settleDesignerNodeDragWhenReady = (
  timerRef: DesignerNodeDragVisualSettleRef,
  pending: NonNullable<DesignerNodeDragVisualSettleRef['current']>,
): void => {
  if (pending.minimumElapsed && pending.routingFinalApplied) {
    finishDesignerNodeDragVisualSettle(timerRef, pending);
  }
};

/**
 * Keeps expensive designer rendering frozen through the short routing commit
 * window. The visual drop class and UI thaw share one bounded lifecycle so a
 * new drag or unmount cannot leave a stale timer or class behind.
 */
export const scheduleDesignerNodeDragVisualSettle = ({
  nodeId,
  timerRef,
  onSettled,
}: Readonly<{
  nodeId: unknown;
  timerRef: DesignerNodeDragVisualSettleRef;
  onSettled: () => void;
}>): void => {
  cancelDesignerNodeDragVisualSettle(timerRef);
  const parsedNodeId = safeNodeId(nodeId);
  if (typeof window === 'undefined') {
    onSettled();
    return;
  }
  if (parsedNodeId) findNodeElement(parsedNodeId)?.classList.add('just-dropped');
  const pending: NonNullable<DesignerNodeDragVisualSettleRef['current']> = {
    minimumHandle: 0,
    watchdogHandle: 0,
    nodeId: parsedNodeId ?? '',
    minimumElapsed: false,
    routingFinalApplied: false,
    onSettled,
  };
  pending.minimumHandle = window.setTimeout(() => {
    if (timerRef.current !== pending) return;
    pending.minimumElapsed = true;
    settleDesignerNodeDragWhenReady(timerRef, pending);
  }, DESIGNER_NODE_DRAG_SETTLE_MS);
  pending.watchdogHandle = window.setTimeout(() => {
    finishDesignerNodeDragVisualSettle(timerRef, pending);
  }, DESIGNER_NODE_DRAG_SETTLE_WATCHDOG_MS);
  timerRef.current = pending;
};

export const markDesignerNodeDragRoutingFinalApplied = (
  timerRef: DesignerNodeDragVisualSettleRef,
): void => {
  const pending = timerRef.current;
  if (!pending) return;
  pending.routingFinalApplied = true;
  settleDesignerNodeDragWhenReady(timerRef, pending);
};
