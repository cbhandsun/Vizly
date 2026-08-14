import { getQueryOrHashParamFromLocation, type LocationLike } from '@/core/utils/inputBoundary';
import { coerceFilterView, type FilterViewType } from './diagramManagementPage.helpers';

const VIEW_PARAM = 'view';

const WORKSPACE_FILTER_VIEWS: readonly FilterViewType[] = [
  'recent',
  'local',
  'cloud',
  'shared',
  'templates',
  'general_templates',
];

type WorkspaceFilterNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

const isWorkspaceFilterNavigationKey = (value: unknown): value is WorkspaceFilterNavigationKey =>
  value === 'ArrowLeft' || value === 'ArrowRight' || value === 'Home' || value === 'End';

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

export const resolveNextWorkspaceFilterView = (
  currentView: unknown,
  key: unknown,
): FilterViewType | null => {
  if (!isWorkspaceFilterNavigationKey(key)) return null;

  const currentIndex = WORKSPACE_FILTER_VIEWS.findIndex(view => view === currentView);
  if (currentIndex < 0) return null;
  if (key === 'Home') return WORKSPACE_FILTER_VIEWS[0];
  if (key === 'End') return WORKSPACE_FILTER_VIEWS[WORKSPACE_FILTER_VIEWS.length - 1];

  const offset = key === 'ArrowRight' ? 1 : -1;
  const nextIndex = (currentIndex + offset + WORKSPACE_FILTER_VIEWS.length)
    % WORKSPACE_FILTER_VIEWS.length;
  return WORKSPACE_FILTER_VIEWS[nextIndex];
};
