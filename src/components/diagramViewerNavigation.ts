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
  openWindow: (url: string, target: string, features: string) => void;
  logFailure: (id: string, error: unknown) => void;
}) => {
  try {
    const url = new URL(currentHref);
    url.searchParams.set('diagram', String(id));
    openWindow(url.toString(), '_blank', 'noopener,noreferrer');
  } catch (error) {
    logFailure(String(id), error);
    openWindow(`/?diagram=${encodeURIComponent(String(id))}`, '_blank', 'noopener,noreferrer');
  }
};

export const seedAutoSaveAndNavigateDiagram = async <TInput, TProcessed>({
  data,
  id,
  ensureSwitchConfirmed,
  normalizeSeedData,
  finalizeNavigation,
}: {
  data: TInput;
  id: string;
  ensureSwitchConfirmed: () => Promise<boolean>;
  normalizeSeedData: (data: TInput) => Promise<TProcessed>;
  finalizeNavigation: (processedData: TProcessed, id: string) => void;
}) => {
  const confirmed = await ensureSwitchConfirmed();
  if (!confirmed) {
    return false;
  }

  const processedData = await normalizeSeedData(data);
  finalizeNavigation(processedData, id);
  return true;
};
