import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerResponseProtocol';

/** Interactive routing is a latency tier, not an alternate quality contract. */
export const shouldEscalateInteractiveDisplayRoute = (
  response: Pick<DisplayEdgesWorkerResponse, 'hardClean'>,
): boolean => response.hardClean !== true;
