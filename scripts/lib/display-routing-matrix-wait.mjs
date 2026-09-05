import { setTimeout as delay } from 'node:timers/promises';
import {
  displayRoutingWaitStateHasTerminalFailure,
  summarizeDisplayRoutingWaitState,
} from './display-routing-matrix-wait-state.mjs';

export const createDisplayRoutingMatrixWaiter = timeoutMs => async (session, expression, label) => {
  const readState = () => session.evaluate(`(() => {
    const summarize = ${summarizeDisplayRoutingWaitState.toString()};
    return summarize(
      window.__vizlyBaseReactFlowDisplayRouting || {},
      window.__vizlyRoutingResponses || [],
      document.querySelectorAll('.react-flow__edge').length,
      window.__vizlyRoutingRequests || [],
    );
  })()`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await session.evaluate(expression);
    if (value) return value;
    const state = await readState();
    if (displayRoutingWaitStateHasTerminalFailure(state)) {
      throw new Error(`Routing failed while waiting for ${label}:\n${JSON.stringify(state, null, 2)}`);
    }
    await delay(100);
  }
  const state = await readState();
  throw new Error(`Timed out waiting for ${label}:\n${JSON.stringify(state, null, 2)}`);
};
