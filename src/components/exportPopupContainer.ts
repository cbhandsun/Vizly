export const resolveExportPopupContainer = (documentRef: Document): HTMLElement => {
  const fullscreenElement = documentRef.fullscreenElement;
  const HTMLElementConstructor = documentRef.defaultView?.HTMLElement;

  if (
    HTMLElementConstructor
    && fullscreenElement instanceof HTMLElementConstructor
  ) {
    return fullscreenElement;
  }

  return documentRef.body;
};
