import { verifyDisplayRoutingMultiPageMatrix } from './display-routing-browser-multipage-matrix.mjs';
import { verifyDisplayRoutingTopologyMatrix } from './display-routing-browser-topology-matrix.mjs';
import { verifyDisplayRoutingBusinessEdits } from './display-routing-business-edits.mjs';
import {
  DISPLAY_ROUTING_MULTI_PAGE_CASE_ID,
  DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
  DISPLAY_ROUTING_BUSINESS_EDIT_CASE_ID,
  DISPLAY_ROUTING_SWIMLANE_EDIT_CASE_ID,
  DISPLAY_ROUTING_LAYOUT_CASES,
} from './display-routing-matrix-cases.mjs';

export const verifyDisplayRoutingBrowserCases = async ({
  requestedCase,
  baseUrl,
  prepareSession,
  waitForValue,
  readFinalRouteExpression,
  auditFinalSvg,
  onProgress,
  verifyTopology = verifyDisplayRoutingTopologyMatrix,
  verifyMultiPage = verifyDisplayRoutingMultiPageMatrix,
  verifyBusinessEdits = verifyDisplayRoutingBusinessEdits,
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
  const businessEditResults = [];
  for (const editCase of [DISPLAY_ROUTING_BUSINESS_EDIT_CASE_ID, DISPLAY_ROUTING_SWIMLANE_EDIT_CASE_ID]) {
    if (requestedCase && requestedCase !== editCase) continue;
    businessEditResults.push(...await verifyBusinessEdits({ baseUrl, prepareSession, waitForValue,
      readFinalRouteExpression, auditFinalSvg, onProgress,
      ...(editCase === DISPLAY_ROUTING_SWIMLANE_EDIT_CASE_ID
        ? { layoutCase: DISPLAY_ROUTING_LAYOUT_CASES.find(item => item.id === 'domain-lanes-tb') } : {}),
    }));
  }
  return { topologyResults, multiPageResults, businessEditResults };
};
