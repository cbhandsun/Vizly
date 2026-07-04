import { getQueryOrHashParamFromLocation, type LocationLike } from '@/core/utils/inputBoundary';

export { type LocationLike };

export const getParamFromSearchOrHash = (
    location: LocationLike | null | undefined,
    name: string
): string | null => getQueryOrHashParamFromLocation(location, name);

export const getDiagramViewerRouteParam = (
    searchParams: URLSearchParams,
    location: LocationLike | null | undefined,
    name: string
): string | null => {
    return searchParams.get(name) || getParamFromSearchOrHash(location, name);
};

export const setDiagramSearchParam = (
    searchParams: URLSearchParams,
    diagramId: string
): URLSearchParams => {
    const next = new URLSearchParams(searchParams);
    next.set('diagram', diagramId);
    return next;
};

export const buildDiagramHashRoute = (diagramId: string): string => (
    `#/?diagram=${encodeURIComponent(diagramId)}`
);
