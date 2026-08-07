export const COMMERCIAL_VIEWPORT_MODAL_CLASS = 'commercial-viewport-modal';
export const COMMERCIAL_VIEWPORT_MODAL_Z_INDEX = 2200;

export const resolveViewportPopupContainer = (documentRef: Document): HTMLElement => {
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

/**
 * Viewport-level dialogs must escape DiagramLayout's CSS zoom so centering,
 * sizing, and interaction targets remain correct in physical pixels.
 */
export const getViewportOverlayContainer = (): HTMLElement => document.body;

/**
 * Compact toolbar popups must escape scrollable toolbar islands while still
 * remaining inside the active fullscreen root when the browser requires it.
 */
export const getViewportPopupContainer = (): HTMLElement => (
  resolveViewportPopupContainer(document)
);
