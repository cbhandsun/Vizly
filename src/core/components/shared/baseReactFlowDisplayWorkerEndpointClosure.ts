import type { Edge, Node } from '@xyflow/react';

import { repairDeclaredTerminalRolesWithHardGate } from './baseReactFlowDeclaredTerminalRoleRepair';
import { displayAlternateHardClosureCandidateIsReady } from './baseReactFlowDisplayAlternateHardClosure';
import { repairBaseReactFlowDisplayEndpointPassageClearance } from './baseReactFlowDisplayEndpointPassageClearance';
import { repairRenderSafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { repairBaseReactFlowDisplayEndpointTrunkClearance } from './baseReactFlowDisplayEndpointTrunkClearance';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';

const ENDPOINT_CLOSURE_BUDGET = 176;
const RENDER_STUB_CLOSURE_BUDGET = 64;

/**
 * Closes the bounded endpoint-only defects that can remain on the facade-
 * equivalent Worker candidate. The transaction is invisible unless the final
 * geometry satisfies hard, commercial-clearance, and render-stub gates.
 */
export const closeBaseReactFlowDisplayWorkerEndpointContract = (
  edges: Edge[],
  nodes: Node[],
): Edge[] => {
  const axisBaseline = repairAxisMismatchedTerminalsWithBoundedPortRoles(
    edges,
    nodes,
    ENDPOINT_CLOSURE_BUDGET,
  );
  const declaredBaseline = repairDeclaredTerminalRolesWithHardGate(
    axisBaseline,
    nodes,
    ENDPOINT_CLOSURE_BUDGET,
  );
  const trunkClosed = repairBaseReactFlowDisplayEndpointTrunkClearance(
    declaredBaseline,
    nodes,
  );
  const passageClosed = repairBaseReactFlowDisplayEndpointPassageClearance(
    trunkClosed,
    nodes,
  );
  const renderStubClosed = repairRenderSafeEndpointStubs(
    passageClosed,
    nodes,
    RENDER_STUB_CLOSURE_BUDGET,
  );
  const finalAxisClosed = repairAxisMismatchedTerminalsWithBoundedPortRoles(
    renderStubClosed,
    nodes,
    ENDPOINT_CLOSURE_BUDGET,
  );
  const candidate = repairDeclaredTerminalRolesWithHardGate(
    finalAxisClosed,
    nodes,
    ENDPOINT_CLOSURE_BUDGET,
  );
  return displayAlternateHardClosureCandidateIsReady(candidate, nodes)
    ? candidate
    : edges;
};
