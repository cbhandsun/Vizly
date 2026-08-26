import { useEffect, useRef } from 'react';

import {
  disposeBaseReactFlowDisplayWorker,
  prewarmBaseReactFlowDisplayWorker,
} from './baseReactFlowDisplayWorkerClient';

export const useBaseReactFlowDisplayWorker = ({
  shouldPrewarm,
}: {
  shouldPrewarm: boolean;
}) => {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => {
    disposeBaseReactFlowDisplayWorker(workerRef);
  }, []);

  useEffect(() => {
    if (shouldPrewarm) prewarmBaseReactFlowDisplayWorker(workerRef);
  }, [shouldPrewarm]);

  return workerRef;
};
