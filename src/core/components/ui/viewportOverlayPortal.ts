export const COMMERCIAL_VIEWPORT_MODAL_CLASS = 'commercial-viewport-modal';
export const COMMERCIAL_VIEWPORT_MODAL_Z_INDEX = 2200;

/**
 * Viewport-level dialogs must escape DiagramLayout's CSS zoom so centering,
 * sizing, and interaction targets remain correct in physical pixels.
 */
export const getViewportOverlayContainer = (): HTMLElement => document.body;
