import type {
  BatchPathFindingJob,
  PathFindingJob,
  Point,
  Rectangle,
} from '../types/routing';

export const finiteNumberOr = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const isWorkerRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const hasWorkerString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const hasFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const getWorkerNodeXY = (value: unknown): Point => {
  const node = isWorkerRecord(value) ? value : {};
  const computed = isWorkerRecord(node.computed) ? node.computed : {};
  const absolute = isWorkerRecord(computed.positionAbsolute)
    ? computed.positionAbsolute
    : isWorkerRecord(node.positionAbsolute)
      ? node.positionAbsolute
      : isWorkerRecord(node.absolutePosition)
        ? node.absolutePosition
        : undefined;
  const position = absolute ?? (isWorkerRecord(node.position) ? node.position : {});
  return {
    x: finiteNumberOr(position.x, finiteNumberOr(node.x)),
    y: finiteNumberOr(position.y, finiteNumberOr(node.y)),
  };
};

export const getWorkerNodeDimension = (
  value: unknown,
  dimension: 'width' | 'height',
  fallback = 0,
): number => {
  if (!isWorkerRecord(value)) return fallback;
  const measured = isWorkerRecord(value.measured) ? value.measured : {};
  return finiteNumberOr(measured[dimension], finiteNumberOr(value[dimension], fallback));
};

export const getWorkerNodeCenter = (value: unknown): Point => {
  const position = getWorkerNodeXY(value);
  return {
    x: position.x + getWorkerNodeDimension(value, 'width') / 2,
    y: position.y + getWorkerNodeDimension(value, 'height') / 2,
  };
};

export const getWorkerNodeId = (value: unknown): string | undefined =>
  isWorkerRecord(value) && hasWorkerString(value.id) ? value.id : undefined;

export const getWorkerNodeType = (value: unknown): string | undefined =>
  isWorkerRecord(value) && hasWorkerString(value.type) ? value.type : undefined;

export const isWorkerRectangle = (value: unknown): value is Rectangle =>
  isWorkerRecord(value)
  && hasFiniteNumber(value.x)
  && hasFiniteNumber(value.y)
  && hasFiniteNumber(value.width)
  && hasFiniteNumber(value.height);

export const readWorkerBorderRadius = (value: unknown): number =>
  isWorkerRecord(value) && hasFiniteNumber(value.borderRadius) ? value.borderRadius : 8;

export const getWorkerErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const isValidWorkerJob = (value: unknown): value is PathFindingJob => {
  if (!isWorkerRecord(value)) return false;
  return hasWorkerString(value.jobId)
    && hasWorkerString(value.edgeId)
    && hasWorkerString(value.source)
    && hasWorkerString(value.target)
    && hasFiniteNumber(value.sourceX)
    && hasFiniteNumber(value.sourceY)
    && hasFiniteNumber(value.targetX)
    && hasFiniteNumber(value.targetY);
};

export const isValidBatchPathfindingWorkerMessage = (
  value: unknown,
): value is BatchPathFindingJob => {
  if (!isWorkerRecord(value)) return false;
  return value.mode === 'batch'
    && hasWorkerString(value.jobId)
    && isWorkerRecord(value.context)
    && Array.isArray(value.tasks)
    && value.tasks.length > 0
    && value.tasks.every(isValidWorkerJob);
};

export const isValidSinglePathfindingWorkerMessage = (value: unknown): boolean => {
  if (!isWorkerRecord(value)) return false;
  const maybeRequest = value as { job?: unknown; graph?: unknown };
  if (maybeRequest.job !== undefined || maybeRequest.graph !== undefined) {
    return isValidWorkerJob(maybeRequest.job) && isWorkerRecord(maybeRequest.graph);
  }
  return isValidWorkerJob(value);
};

export const postInvalidWorkerMessage = (
  jobId: string | undefined,
  error: string,
  batch = false,
): void => {
  self.postMessage(batch
    ? { type: 'BATCH_RESULT', batchId: jobId ?? '', error }
    : { jobId: jobId ?? '', error });
};
