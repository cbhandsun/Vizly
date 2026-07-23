import type { MutableRefObject } from 'react';
import type { Node } from '@xyflow/react';

export const computeBaseReactFlowNodeStructureSignature = (nodes: Node[]): string => (
  nodes.map((node) => node.id).sort().join('|')
);

export const shouldResetBaseReactFlowInitialization = ({
  currentSignature,
  previousSignature,
  nodeCount,
}: {
  currentSignature: string;
  previousSignature: string;
  nodeCount: number;
}): boolean => currentSignature !== previousSignature && nodeCount > 0;

export const scheduleBaseReactFlowInitializationReset = <TBBox, TContainer>({
  setHasInitialized,
  prevBBoxRef,
  prevContainerRef,
  cooldownUntilRef,
  lastZoomRef,
  initAtRef,
  now = Date.now(),
}: {
  setHasInitialized: (value: boolean) => void;
  prevBBoxRef: MutableRefObject<TBBox | null>;
  prevContainerRef: MutableRefObject<TContainer | null>;
  cooldownUntilRef: MutableRefObject<number>;
  lastZoomRef: MutableRefObject<number | null>;
  initAtRef: MutableRefObject<number>;
  now?: number;
}): ReturnType<typeof setTimeout> => {
  prevBBoxRef.current = null;
  prevContainerRef.current = null;
  cooldownUntilRef.current = 0;
  lastZoomRef.current = null;
  initAtRef.current = now;

  return setTimeout(() => setHasInitialized(false), 0);
};
