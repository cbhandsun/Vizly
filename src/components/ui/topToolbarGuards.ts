export type ToolbarEdgeMode = 'advanced-smart' | 'native';

export const isToolbarEdgeMode = (value: unknown): value is ToolbarEdgeMode => (
  value === 'advanced-smart' || value === 'native'
);

export const getToolbarPopupContainer = (trigger: HTMLElement): HTMLElement => {
  if (typeof document === 'undefined') return trigger;
  return (document.fullscreenElement as HTMLElement | null) || trigger.parentElement || document.body;
};
