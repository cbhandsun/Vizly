import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useStoreApi } from '@xyflow/react';
import type { EdgeLabelArrangementInput } from './edgeLabelArrangement';
import { getEdgeLabelArrangementStore } from './edgeLabelArrangementStore';

export const useEdgeLabelArrangement = (input: EdgeLabelArrangementInput) => {
  const canvas = useStoreApi();
  // useStoreApi creates a different wrapper in every edge hook. Its getState
  // function, however, belongs to the shared underlying React Flow store.
  const store = useMemo(() => getEdgeLabelArrangementStore(canvas.getState), [canvas.getState]);
  const [owner] = useState(() => Symbol('edge-label'));
  const key = JSON.stringify(input);
  const getSnapshot = useCallback(() => store.get(input.id), [store, input.id]);
  const snapshot = useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
  // Register immutable input geometry, never the arranged label coordinates.
  // The store batches the commit's registrations and deduplicates equal inputs.
  useLayoutEffect(() => { store.put(owner, key, input); }, [store, owner, key, input]);
  useLayoutEffect(() => () => store.remove(owner, input.id), [store, owner, input.id]);
  // A previous path/size snapshot must never place a new route's label.
  return snapshot?.key === key ? snapshot.placement : undefined;
};
