import { verifyDisplayRoutingMultiPageMatrix } from './display-routing-browser-multipage-matrix.mjs';
import { verifyDisplayRoutingTopologyMatrix } from './display-routing-browser-topology-matrix.mjs';
import {
  DISPLAY_ROUTING_MULTI_PAGE_CASE_ID,
  DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
} from './display-routing-matrix-cases.mjs';

export const verifyDisplayRoutingBrowserCases = async ({
  requestedCase,
  baseUrl,
  prepareSession,
  waitForValue,
  readFinalRouteExpression,
  auditFinalSvg,
  verifyTopology = verifyDisplayRoutingTopologyMatrix,
  verifyMultiPage = verifyDisplayRoutingMultiPageMatrix,
}) => {
  const waitForInitialRoute = (session, label) => waitForValue(
    session,
    readFinalRouteExpression(''),
    `${label} initial route`,
  );
  const topologyResults = !requestedCase || requestedCase === DISPLAY_ROUTING_TOPOLOGY_CASE_ID
    ? [await verifyTopology({ baseUrl, prepareSession, waitForInitialRoute, auditFinalSvg })]
    : [];
  const multiPageResults = !requestedCase || requestedCase === DISPLAY_ROUTING_MULTI_PAGE_CASE_ID
    ? [await verifyMultiPage({
      baseUrl,
      prepareSession,
      waitForValue,
      waitForInitialRoute,
      waitForLayoutRoute: (session, previousJobId, label) => waitForValue(
        session,
        readFinalRouteExpression('layout:', previousJobId),
        `${label} layout route`,
      ),
      auditFinalSvg,
    })]
    : [];
  return { topologyResults, multiPageResults };
};
