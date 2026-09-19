import { setTimeout as delay } from 'node:timers/promises';

import { readDisplayRoutingNodeGeometryParity } from './display-routing-browser-geometry.mjs';

export const waitForDisplayRoutingNodeGeometryParity = async (session, rawNodes, label) => {
  const expression = `(${readDisplayRoutingNodeGeometryParity.toString()})(${JSON.stringify(rawNodes)})`;
  const deadline = Date.now() + 5_000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await session.evaluate(expression);
    if (
      latest
      && latest.nodeScanComplete === true
      && latest.comparedNodeCount > 0
      && latest.positionMismatchCount === 0
      && latest.sizeMismatchCount === 0
    ) return latest;
    await delay(100);
  }
  throw new Error(`Worker/DOM node geometry parity failed for ${label}: ${JSON.stringify(latest)}`);
};
