export const getTemplateCascaderPopupContainer = (triggerNode: HTMLElement): HTMLElement => (
  triggerNode.closest<HTMLElement>('[data-diagram-switcher-surface="true"]') ?? document.body
);
