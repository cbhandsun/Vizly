import { coerceDiagramId } from '../../utils/inputBoundary';
import { logDiagramControlDispatchFailure } from './diagramControlLogging';

export const DIAGRAM_CONTROL_REQUEST_EVENT = 'vizly:diagram-control-request';
const DIAGRAM_CONTROL_REQUEST_SCHEMA = 'vizly-diagram-control-request-v1';
const LAYOUT_COMMIT_FIT_TIMEOUT_MS = 500;

export type DiagramControlRequestResult =
  | 'applied'
  | 'unhandled'
  | 'cancelled'
  | 'timed-out'
  | 'failed';

type PendingRequest = {
  claimed: boolean;
  controller: AbortController;
  resolve: (result: DiagramControlRequestResult) => void;
  settle: (result: DiagramControlRequestResult) => boolean;
};

const pendingRequests = new WeakMap<Event, PendingRequest>();

const readLayoutCommitFitDetail = (event: Event): { diagramId?: string } | null => {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const record = detail as Record<string, unknown>;
  if (
    record.schema !== DIAGRAM_CONTROL_REQUEST_SCHEMA
    || record.action !== 'fit'
    || record.mode !== 'layout-commit'
  ) return null;
  if (record.diagramId === undefined) return {};
  if (typeof record.diagramId !== 'string') return null;
  const diagramId = coerceDiagramId(record.diagramId, '');
  return diagramId && diagramId === record.diagramId ? { diagramId } : null;
};

export const requestLayoutCommitFit = ({
  diagramId,
  signal,
}: {
  diagramId?: string;
  signal: AbortSignal;
}): Promise<DiagramControlRequestResult> => {
  if (signal.aborted) return Promise.resolve('cancelled');
  const safeDiagramId = diagramId ? coerceDiagramId(diagramId, '') : undefined;

  return new Promise(resolve => {
    const event = new CustomEvent(DIAGRAM_CONTROL_REQUEST_EVENT, {
      detail: {
        schema: DIAGRAM_CONTROL_REQUEST_SCHEMA,
        action: 'fit',
        mode: 'layout-commit',
        diagramId: safeDiagramId || undefined,
      },
    });
    const controller = new AbortController();
    let settled = false;
    let timeoutId: number | null = null;
    const onAbort = () => pending.settle('cancelled');
    const pending: PendingRequest = {
      claimed: false,
      controller,
      resolve,
      settle: result => {
        if (settled) return false;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
        controller.abort();
        pendingRequests.delete(event);
        resolve(result);
        return true;
      },
    };
    pendingRequests.set(event, pending);
    signal.addEventListener('abort', onAbort, { once: true });
    timeoutId = window.setTimeout(
      () => pending.settle('timed-out'),
      LAYOUT_COMMIT_FIT_TIMEOUT_MS,
    );

    try {
      window.dispatchEvent(event);
      if (!pending.claimed) pending.settle('unhandled');
    } catch (error) {
      logDiagramControlDispatchFailure('fit', error);
      pending.settle('failed');
    }
  });
};

export const claimLayoutCommitFitRequest = (event: Event): Readonly<{
  diagramId?: string;
  signal: AbortSignal;
}> | null => {
  const detail = readLayoutCommitFitDetail(event);
  const pending = pendingRequests.get(event);
  if (!detail || !pending || pending.claimed || pending.controller.signal.aborted) return null;
  pending.claimed = true;
  return { ...detail, signal: pending.controller.signal };
};

export const inspectLayoutCommitFitRequest = (
  event: Event,
): Readonly<{ diagramId?: string }> | null => {
  const detail = readLayoutCommitFitDetail(event);
  return detail && pendingRequests.has(event) ? detail : null;
};

export const resolveLayoutCommitFitRequest = (
  event: Event,
  result: Extract<DiagramControlRequestResult, 'applied' | 'failed'>,
): boolean => pendingRequests.get(event)?.settle(result) ?? false;
