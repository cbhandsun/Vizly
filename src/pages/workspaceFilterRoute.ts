import { getQueryOrHashParamFromLocation, type LocationLike } from '@/core/utils/inputBoundary';
import { coerceFilterView, type FilterViewType } from './diagramManagementPage.helpers';

const VIEW_PARAM = 'view';

export interface WorkspaceFilterSearchUpdate {
  readonly searchParams: URLSearchParams;
  readonly changed: boolean;
}

export const resolveWorkspaceFilterView = (
  searchParams: Pick<URLSearchParams, 'get'>,
  location: LocationLike | null | undefined,
): FilterViewType => {
  const routeValue = searchParams.get(VIEW_PARAM);
  const rawView = routeValue ?? getQueryOrHashParamFromLocation(location, VIEW_PARAM);
  return coerceFilterView(rawView);
};

export const createWorkspaceFilterSearchUpdate = (
  currentSearchParams: URLSearchParams,
  nextView: unknown,
): WorkspaceFilterSearchUpdate => {
  const normalizedView = coerceFilterView(nextView);
  const searchParams = new URLSearchParams(currentSearchParams);

  if (normalizedView === 'recent') searchParams.delete(VIEW_PARAM);
  else searchParams.set(VIEW_PARAM, normalizedView);

  return {
    searchParams,
    changed: searchParams.toString() !== currentSearchParams.toString(),
  };
};
