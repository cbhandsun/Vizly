import { getQueryParamFromSearch } from '../../utils/inputBoundary';

const DEFAULT_FIT_RATIO = 0.85;
const DEFAULT_MAX_FIT_ZOOM = 1.0;

const readNestedValue = (value: unknown, path: readonly string[]): unknown => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const readBoundedNumber = (
  value: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
};

export const readBaseReactFlowFitRatio = ({
  search,
  readConfig,
  onReadFailure,
}: {
  search: string;
  readConfig: () => unknown;
  onReadFailure?: (error: unknown) => void;
}): number => {
  try {
    const urlRatio = Number.parseFloat(getQueryParamFromSearch(search, 'fitRatio') || '');
    if (!Number.isNaN(urlRatio) && urlRatio > 0 && urlRatio <= 2) {
      return urlRatio;
    }

    return readBoundedNumber(readNestedValue(readConfig(), ['canvas', 'zoom', 'fitRatio']), {
      min: Number.EPSILON,
      max: 2,
      fallback: DEFAULT_FIT_RATIO,
    });
  } catch (error) {
    onReadFailure?.(error);
    return DEFAULT_FIT_RATIO;
  }
};

export const readBaseReactFlowMaxFitZoom = ({
  readConfig,
  onReadFailure,
}: {
  readConfig: () => unknown;
  onReadFailure?: (error: unknown) => void;
}): number => {
  try {
    return readBoundedNumber(readNestedValue(readConfig(), ['canvas', 'zoom', 'maxFitZoom']), {
      min: Number.EPSILON,
      max: 4,
      fallback: DEFAULT_MAX_FIT_ZOOM,
    });
  } catch (error) {
    onReadFailure?.(error);
    return DEFAULT_MAX_FIT_ZOOM;
  }
};
