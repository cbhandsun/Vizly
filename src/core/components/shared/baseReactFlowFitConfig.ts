import { getQueryParamFromSearch } from '../../utils/inputBoundary';

const DEFAULT_FIT_RATIO = 0.85;
const DEFAULT_MAX_FIT_ZOOM = 1.0;

export const readBaseReactFlowFitRatio = ({
  search,
  readConfig,
  onReadFailure,
}: {
  search: string;
  readConfig: () => any;
  onReadFailure?: (error: unknown) => void;
}): number => {
  try {
    const urlRatio = Number.parseFloat(getQueryParamFromSearch(search, 'fitRatio') || '');
    if (!Number.isNaN(urlRatio) && urlRatio > 0 && urlRatio <= 2) {
      return urlRatio;
    }

    return readConfig()?.canvas?.zoom?.fitRatio ?? DEFAULT_FIT_RATIO;
  } catch (error) {
    onReadFailure?.(error);
    return DEFAULT_FIT_RATIO;
  }
};

export const readBaseReactFlowMaxFitZoom = ({
  readConfig,
  onReadFailure,
}: {
  readConfig: () => any;
  onReadFailure?: (error: unknown) => void;
}): number => {
  try {
    return readConfig()?.canvas?.zoom?.maxFitZoom ?? DEFAULT_MAX_FIT_ZOOM;
  } catch (error) {
    onReadFailure?.(error);
    return DEFAULT_MAX_FIT_ZOOM;
  }
};
