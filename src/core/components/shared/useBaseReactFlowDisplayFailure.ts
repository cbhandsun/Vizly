import { useCallback, useState } from 'react';
import type { BaseReactFlowDisplayFailure } from './baseReactFlowDisplayFailure';
import type { BaseReactFlowRoutingSessionRuntime } from './baseReactFlowRoutingSessionRuntime';

/** Scope failure to one geometry intent, including a new drag or layout pause. */
export const useBaseReactFlowDisplayFailure = (
  inputSignature: string,
  inputGeometryDigest: string,
  intentPaused: boolean,
  runtime: BaseReactFlowRoutingSessionRuntime,
) => {
  const intentKey = JSON.stringify([inputSignature, inputGeometryDigest, intentPaused]);
  const [state, setState] = useState<{
    intentKey: string;
    runtime: BaseReactFlowRoutingSessionRuntime;
    failure: BaseReactFlowDisplayFailure | null;
  }>({ intentKey, runtime, failure: null });
  // Adjust this component's state during render so old failure cannot flash for
  // a new intent or reappear when a cancelled drag returns to the same geometry.
  const ownsState = state.intentKey === intentKey && state.runtime === runtime;
  if (!ownsState) setState({ intentKey, runtime, failure: null });
  const setFailure = useCallback((failure: BaseReactFlowDisplayFailure | null) => {
    setState(current => current.intentKey === intentKey && current.runtime === runtime && current.failure !== failure
      ? { intentKey, runtime, failure }
      : current);
  }, [intentKey, runtime]);
  return { failure: ownsState ? state.failure : null, setFailure };
};
