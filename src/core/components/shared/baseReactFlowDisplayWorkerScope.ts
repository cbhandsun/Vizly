import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';

interface DisplayEdgesWorkerScope {
  postMessage: (response: DisplayEdgesWorkerResponse) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

export const displayEdgesWorkerScope = typeof self !== 'undefined'
  && !('document' in self)
  ? self as unknown as DisplayEdgesWorkerScope
  : null;

export const postDisplayEdgesResponse = (response: DisplayEdgesWorkerResponse): void => {
  displayEdgesWorkerScope?.postMessage(response);
};
