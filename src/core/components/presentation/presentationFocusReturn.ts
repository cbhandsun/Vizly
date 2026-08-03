let presentationFocusReturnRequested = false;

export const requestPresentationFocusReturn = (): void => {
  presentationFocusReturnRequested = true;
};

export const consumePresentationFocusReturnRequest = (): boolean => {
  if (!presentationFocusReturnRequested) return false;
  presentationFocusReturnRequested = false;
  return true;
};
