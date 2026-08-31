import { useCallback, useState } from 'react';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';
import {
  DEFAULT_LAYOUT_SELECTION,
  parsePersistedLayoutSelection,
  type LayoutSelection,
} from '../layoutSelectionPersistence';

export { parsePersistedLayoutSelection } from '../layoutSelectionPersistence';

/** Saved selection describes the canvas; restoring it never executes a layout. */
export const usePersistedLayoutSelection = (diagramId?: string) => {
  const [state, setState] = useState({ scope: diagramId, selection: DEFAULT_LAYOUT_SELECTION });
  const selection = state.scope === diagramId ? state.selection : DEFAULT_LAYOUT_SELECTION;
  const update = useCallback((patch: Partial<LayoutSelection>) => {
    setState(previous => ({ scope: diagramId, selection: {
      ...(previous.scope === diagramId ? previous.selection : DEFAULT_LAYOUT_SELECTION), ...patch,
    } }));
  }, [diagramId]);
  const setLastDomainStrategy = useCallback((strategy: string) => update({ strategy }), [update]);
  const setLastDomainDirection = useCallback((direction: FlowchartLayoutDirection) => update({ direction }), [update]);
  const setLastNodeLayout = useCallback((nodeLayout: string) => update({ nodeLayout }), [update]);
  const restoreLayoutSelection = useCallback((metadata: unknown) => {
    setState({
      scope: diagramId,
      selection: parsePersistedLayoutSelection(metadata) ?? DEFAULT_LAYOUT_SELECTION,
    });
  }, [diagramId]);
  return { lastDomainStrategy: selection.strategy, lastDomainDirection: selection.direction,
    lastNodeLayout: selection.nodeLayout, layoutSelection: selection, restoreLayoutSelection,
    setLastDomainStrategy, setLastDomainDirection, setLastNodeLayout };
};

/** Compose layout metadata with pages without changing either owner's state model. */
export const useLayoutAutoSaveMetadata = <T extends object, R>(
  multiPage: { getPersistedMetadata: () => T | null; restorePersistedMetadata: (metadata: unknown) => R },
  layoutSelection: LayoutSelection,
  restoreLayoutSelection: (metadata: unknown) => void,
) => {
  const { getPersistedMetadata, restorePersistedMetadata } = multiPage;
  const getAutoSaveMetadata = useCallback(() => ({ ...getPersistedMetadata(), layoutSelection }),
    [getPersistedMetadata, layoutSelection]);
  const restoreAutoSaveMetadata = useCallback((metadata: unknown) => {
    restoreLayoutSelection(metadata);
    return restorePersistedMetadata(metadata);
  }, [restoreLayoutSelection, restorePersistedMetadata]);
  return { getAutoSaveMetadata, restoreAutoSaveMetadata };
};
