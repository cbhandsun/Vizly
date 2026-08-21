import { useCallback, useState } from 'react';
import { getLastViewport, persistLastViewport, type Viewport } from './viewportStore';

export const usePersistedViewport = (scope?: string) => {
  const [initialViewport] = useState(() => getLastViewport(scope));
  const persistViewport = useCallback((
    _event: MouseEvent | TouchEvent | null,
    viewport: Viewport,
  ) => {
    persistLastViewport(viewport, scope);
  }, [scope]);

  return { initialViewport, persistViewport };
};
