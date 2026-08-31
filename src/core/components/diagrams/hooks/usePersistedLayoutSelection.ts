import { useCallback, useState } from 'react';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';

const STRATEGIES = new Set(['domain-dagre', 'domain-dagre-sub-horizontal', 'dagre', 'domain-lanes',
  'domain-horizontal', 'domain-vertical', 'domain-elk', 'elk', 'domain-compound-elk', 'tree', 'force']);
const NODE_LAYOUTS = new Set(['dagre', 'flow', 'grid', 'horizontal', 'vertical']);
type LayoutSelection = Readonly<{
  version: 1;
  strategy: string;
  direction: FlowchartLayoutDirection;
  nodeLayout: string;
}>;
const DEFAULT_SELECTION: LayoutSelection = { version: 1, strategy: 'domain-dagre', direction: 'TB', nodeLayout: 'dagre' };
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const parsePersistedLayoutSelection = (metadata: unknown): LayoutSelection | null => {
  const value = isRecord(metadata) ? metadata.layoutSelection : null;
  if (!isRecord(value) || value.version !== 1 || typeof value.strategy !== 'string'
    || !STRATEGIES.has(value.strategy) || typeof value.nodeLayout !== 'string'
    || !NODE_LAYOUTS.has(value.nodeLayout)
    || (value.direction !== 'TB' && value.direction !== 'BT' && value.direction !== 'LR' && value.direction !== 'RL')) return null;
  return { version: 1, strategy: value.strategy, direction: value.direction, nodeLayout: value.nodeLayout };
};

/** Saved selection describes the canvas; restoring it never executes a layout. */
export const usePersistedLayoutSelection = (diagramId?: string) => {
  const [state, setState] = useState({ scope: diagramId, selection: DEFAULT_SELECTION });
  const selection = state.scope === diagramId ? state.selection : DEFAULT_SELECTION;
  const update = useCallback((patch: Partial<LayoutSelection>) => {
    setState(previous => ({ scope: diagramId, selection: {
      ...(previous.scope === diagramId ? previous.selection : DEFAULT_SELECTION), ...patch,
    } }));
  }, [diagramId]);
  const setLastDomainStrategy = useCallback((strategy: string) => update({ strategy }), [update]);
  const setLastDomainDirection = useCallback((direction: FlowchartLayoutDirection) => update({ direction }), [update]);
  const setLastNodeLayout = useCallback((nodeLayout: string) => update({ nodeLayout }), [update]);
  const restoreLayoutSelection = useCallback((metadata: unknown) => {
    setState({ scope: diagramId, selection: parsePersistedLayoutSelection(metadata) ?? DEFAULT_SELECTION });
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
