type DialogRoot = Pick<Document, 'querySelectorAll'>;

const isVisibleModalDialog = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.getAttribute('aria-hidden') === 'true' || element.hidden) return false;
  return element.getClientRects().length > 0;
};

export const hasVisibleModalDialog = (
  root: DialogRoot = document,
): boolean => Array.from(
  root.querySelectorAll('[role="dialog"][aria-modal="true"]'),
).some(isVisibleModalDialog);
