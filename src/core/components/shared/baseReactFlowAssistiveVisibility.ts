const REACT_FLOW_RENDERER_SELECTOR = '.react-flow__renderer';

/**
 * Keeps plugin-owned canvas content available while removing the replaced
 * React Flow renderer from the accessibility tree.
 */
export const syncBaseReactFlowRendererAssistiveVisibility = (
  container: HTMLElement | null,
  hidden: boolean,
): HTMLElement | null => {
  const renderer = container?.querySelector<HTMLElement>(REACT_FLOW_RENDERER_SELECTOR) ?? null;
  if (!renderer) return null;

  if (hidden) {
    renderer.setAttribute('aria-hidden', 'true');
  } else {
    renderer.removeAttribute('aria-hidden');
  }
  return renderer;
};

export const bindBaseReactFlowRendererAssistiveVisibility = (
  container: HTMLElement | null,
  hidden: boolean,
): (() => void) => {
  let renderer = syncBaseReactFlowRendererAssistiveVisibility(container, hidden);
  let observer: MutationObserver | null = null;

  if (!renderer && container && hidden && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      renderer = syncBaseReactFlowRendererAssistiveVisibility(container, true);
      if (renderer) observer?.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  return () => {
    observer?.disconnect();
    renderer?.removeAttribute('aria-hidden');
  };
};
