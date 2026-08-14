import { coerceDiagramId } from '@/core/utils/inputBoundary';

interface DiagramViewerNewTabHandle {
  opener: unknown;
  close?: () => void;
}

export const selectDiagramInViewer = ({
  id,
  setSearchParams,
  setDiagramSearchParam,
  addRecentDiagram,
}: {
  id: string;
  setSearchParams: (updater: (prev: URLSearchParams) => URLSearchParams) => void;
  setDiagramSearchParam: (prev: URLSearchParams, id: string) => URLSearchParams;
  addRecentDiagram: (id: string) => void;
}) => {
  setSearchParams((prev) => setDiagramSearchParam(prev, id));
  addRecentDiagram(id);
};

export const openDiagramViewerInNewTab = ({
  id,
  currentHref,
  openWindow,
  logFailure,
}: {
  id: string;
  currentHref: string;
  openWindow: (
    url: string,
    target: string,
    features: string,
  ) => DiagramViewerNewTabHandle | null;
  logFailure: (id: string, error: unknown) => void;
}): boolean => {
  const normalizedId = coerceDiagramId(id);
  if (!normalizedId) {
    logFailure(String(id), new Error('Invalid diagram id'));
    return false;
  }

  let destination: string;
  try {
    const url = new URL(currentHref);
    url.searchParams.delete('diagram');
    url.hash = `#/?diagram=${encodeURIComponent(normalizedId)}`;
    destination = url.toString();
  } catch (error) {
    logFailure(normalizedId, error);
    destination = `/#/?diagram=${encodeURIComponent(normalizedId)}`;
  }

  try {
    const openedWindow = openWindow(destination, '_blank', '');
    if (!openedWindow) return false;
    try {
      openedWindow.opener = null;
    } catch (error) {
      openedWindow.close?.();
      logFailure(normalizedId, error);
      return false;
    }
    return true;
  } catch (error) {
    logFailure(normalizedId, error);
    return false;
  }
};

export const seedAutoSaveAndNavigateDiagram = async <TInput, TProcessed>({
  data,
  id,
  ensureSwitchConfirmed,
  normalizeSeedData,
  finalizeNavigation,
  isCurrent = () => true,
}: {
  data: TInput;
  id: string;
  ensureSwitchConfirmed: () => Promise<boolean>;
  normalizeSeedData: (data: TInput) => Promise<TProcessed>;
  finalizeNavigation: (processedData: TProcessed, id: string) => void;
  isCurrent?: () => boolean;
}) => {
  if (!isCurrent()) return false;
  const confirmed = await ensureSwitchConfirmed();
  if (!confirmed || !isCurrent()) {
    return false;
  }

  const processedData = await normalizeSeedData(data);
  if (!isCurrent()) return false;
  finalizeNavigation(processedData, id);
  return true;
};
