import { useEffect } from 'react';

import {
  disposeBaseReactFlowDisplayWorker,
  prewarmBaseReactFlowDisplayWorker,
} from './baseReactFlowDisplayWorkerClient';
import {
  useBaseReactFlowRoutingSessionRuntime,
  type BaseReactFlowRoutingSessionRuntime,
} from './baseReactFlowRoutingSessionRuntime';

export const useBaseReactFlowDisplayWorker = ({
  shouldPrewarm,
  routingSessionRuntime,
}: {
  shouldPrewarm: boolean;
  routingSessionRuntime?: BaseReactFlowRoutingSessionRuntime;
}) => {
  const runtime = useBaseReactFlowRoutingSessionRuntime(routingSessionRuntime);

  useEffect(() => {
    runtime.registerWorkerDisposer(disposeBaseReactFlowDisplayWorker);
  }, [runtime]);

  useEffect(() => {
    if (shouldPrewarm) prewarmBaseReactFlowDisplayWorker(runtime.workerRef);
  }, [runtime, shouldPrewarm]);

  return runtime;
};
