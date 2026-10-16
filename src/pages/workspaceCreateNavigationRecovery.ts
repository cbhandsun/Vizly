/** A lazy editor transition can be cancelled before the workspace unmounts. */
export const observeWorkspaceCreateNavigationReturn = ({
  events,
  currentHash,
  isNavigationPending,
  recover,
}: {
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  currentHash: () => string;
  isNavigationPending: () => boolean;
  recover: () => void;
}): (() => void) => {
  const onHashChange = () => {
    if (isNavigationPending() && /^#\/manage(?:\?|$)/.test(currentHash())) recover();
  };
  events.addEventListener('hashchange', onHashChange);
  return () => events.removeEventListener('hashchange', onHashChange);
};
