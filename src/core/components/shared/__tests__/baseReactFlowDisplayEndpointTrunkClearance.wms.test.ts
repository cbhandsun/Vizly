// @vitest-environment jsdom

import '../../../../test/setup';

import { describe, expect, it } from 'vitest';

import wmsStandardData from '../../../../data/standardized/WmsStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { coerceCustomPreset } from '../../../utils/customPresetStorage';
import { createNodeClearanceGraphEvaluationContext } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import { repairDeclaredTerminalRolesWithHardGate } from '../baseReactFlowDeclaredTerminalRoleRepair';
import { countDisplayBusinessNodeCommercialClearanceViolations } from '../baseReactFlowDisplayBusinessNodeClearance';
import { createBaseReactFlowDisplayEdges } from '../baseReactFlowDisplayEdges';
import { computeBaseReactFlowDisplayEdgeEpoch } from '../baseReactFlowDisplayEdgeCore';
import {
  countRenderUnsafeEndpointStubs,
  repairRenderSafeEndpointStubs,
} from '../baseReactFlowDisplayEndpointStubRepair';
import {
  repairBaseReactFlowDisplayEndpointPassageClearance,
  type DisplayEndpointPassageClearanceDiagnostics,
} from '../baseReactFlowDisplayEndpointPassageClearance';
import { buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates } from '../baseReactFlowDisplayEndpointTrunkClearance';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from '../baseReactFlowDisplayTerminalPortRepair';
import { withAbsoluteNodePositions } from './baseReactFlowDisplayEdges.testUtils';

describe('baseReactFlowDisplayEndpointTrunkClearance WMS regression', () => {
  it('keeps the master-data nested pair on a clear sibling stem without redundant repair', async () => {
    const preset = coerceCustomPreset(wmsStandardData, {
      id: 'WmsEndpointTrunkClearanceProbe',
      title: 'WmsEndpointTrunkClearanceProbe',
    });
    if (!preset) throw new Error('expected the WMS preset to be valid');
    const canvas = await standardDataToCanvas(preset);
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const nodes = withAbsoluteNodePositions(projected.nodes);
    const routed = createBaseReactFlowDisplayEdges({
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
    });
    const axis = repairAxisMismatchedTerminalsWithBoundedPortRoles(routed, nodes, 176);
    const baseline = repairDeclaredTerminalRolesWithHardGate(axis, nodes, 176);
    const candidates = buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(
      baseline,
      nodes,
      { maxGroups: 8 },
    );
    const candidate = candidates[0];
    const clearance = createNodeClearanceGraphEvaluationContext(nodes);
    const risk = (items: typeof baseline) => items.reduce((total, edge) => (
      total + clearance.score(getDisplayComputedPath(edge), edge, 48)
    ), 0);
    const passageBaseline = repairBaseReactFlowDisplayEndpointPassageClearance(baseline, nodes);
    const diagnostics = JSON.stringify({
      candidateCount: candidates.length,
      baselineRisk: risk(baseline),
      baselineHardReport: getDisplayHardQualityGateReport(baseline, nodes, 'polished'),
      passageRisk: risk(passageBaseline),
      passageChangedEdgeIds: passageBaseline.flatMap((edge, index) => (
        edge === baseline[index] ? [] : [edge.id]
      )),
      candidateRisk: candidate ? risk(candidate) : null,
      changedEdgeIds: candidate?.flatMap((edge, index) => (
        edge === baseline[index] ? [] : [edge.id]
      )),
      hardReport: candidate ? getDisplayHardQualityGateReport(candidate, nodes, 'polished') : null,
    }, null, 2);

    // The trunk transaction has nothing to change when the remaining risk is
    // on a separate single edge. Keep that no-op explicit and require the
    // following passage transaction to close the real 48px risk instead.
    if (candidates.length === 0) {
      expect(risk(baseline), diagnostics).toBe(16);
      expect(getDisplayHardQualityGateReport(baseline, nodes, 'polished').hardClean).toBe(true);
      expect(countRenderUnsafeEndpointStubs(baseline)).toBe(0);
      expect(passageBaseline.flatMap((edge, index) => (
        edge === baseline[index] ? [] : [edge.id]
      )), diagnostics).toEqual(['e_inv_replen']);
      expect(risk(passageBaseline), diagnostics).toBe(0);
      expect(getDisplayHardQualityGateReport(passageBaseline, nodes, 'polished').hardClean)
        .toBe(true);
      return;
    }
    expect(candidate, diagnostics).toBeDefined();
    if (!candidate) throw new Error('expected the real WMS endpoint-trunk candidate');
    expect(candidate.flatMap((edge, index) => edge === baseline[index] ? [] : [edge.id]))
      .toEqual(['e_md_asn', 'e_md_erp']);
    // Earlier routing may already improve these residuals. Preserve the known
    // risk ceilings and require this transaction to improve the actual input.
    expect(risk(baseline), diagnostics).toBeLessThanOrEqual(32.68);
    expect(risk(candidate), diagnostics).toBeLessThanOrEqual(8);
    expect(risk(candidate), diagnostics).toBeLessThan(risk(baseline));
    expect(getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean, diagnostics)
      .toBe(true);

    const passageDiagnostics: DisplayEndpointPassageClearanceDiagnostics = {
      acceptedCandidateCount: 0,
      commercialImprovementCount: 0,
      generatedShiftCandidateCount: 0,
      ladderCandidateCount: 0,
      maximumShiftedCrossingCount: 0,
      sharedEndpointCandidateCount: 0,
      singlePeerCrossingCandidateCount: 0,
    };
    const fullCandidate = repairBaseReactFlowDisplayEndpointPassageClearance(candidate, nodes, {
      diagnostics: passageDiagnostics,
    });
    const renderSafeCandidate = repairRenderSafeEndpointStubs(fullCandidate, nodes, 64);
    const fullDiagnostics = JSON.stringify({
      risk: risk(fullCandidate),
      renderSafe: {
        changedEdgeIds: renderSafeCandidate.flatMap((edge, index) => (
          edge === fullCandidate[index] ? [] : [edge.id]
        )),
        hardReport: getDisplayHardQualityGateReport(renderSafeCandidate, nodes, 'polished'),
        risk: risk(renderSafeCandidate),
        unsafeEndpointStubs: countRenderUnsafeEndpointStubs(renderSafeCandidate),
        unsafeEdgeIds: renderSafeCandidate.filter(edge => (
          countRenderUnsafeEndpointStubs([edge]) > 0
        )).map(edge => edge.id),
        unsafePaths: renderSafeCandidate.filter(edge => (
          countRenderUnsafeEndpointStubs([edge]) > 0
        )).map(edge => ({ id: edge.id, path: getDisplayComputedPath(edge) })),
        residualRiskEdges: renderSafeCandidate.flatMap(edge => {
          const edgeRisk = clearance.score(getDisplayComputedPath(edge), edge, 48);
          return edgeRisk > 0 ? [{ id: edge.id, path: getDisplayComputedPath(edge), risk: edgeRisk }] : [];
        }),
      },
      passageDiagnostics,
      hardReport: getDisplayHardQualityGateReport(fullCandidate, nodes, 'polished'),
      changedEdgeIds: fullCandidate.flatMap((edge, index) => (
        edge === candidate[index] ? [] : [edge.id]
      )),
      paths: fullCandidate.filter(edge => (
        edge.id === 'e_inv_bi' || edge.id === 'e_receipt_bi'
      )).map(edge => ({ id: edge.id, path: getDisplayComputedPath(edge) })),
    }, null, 2);
    expect(risk(fullCandidate), fullDiagnostics).toBe(0);
    expect(fullCandidate.flatMap((edge, index) => edge === candidate[index] ? [] : [edge.id]))
      .toEqual(['e_inv_bi', 'e_receipt_bi']);
    expect(getDisplayHardQualityGateReport(fullCandidate, nodes, 'polished').hardClean,
      fullDiagnostics).toBe(true);
    expect(countRenderUnsafeEndpointStubs(renderSafeCandidate), fullDiagnostics).toBe(0);
    expect(risk(renderSafeCandidate), fullDiagnostics).toBe(0);
    expect(countDisplayBusinessNodeCommercialClearanceViolations(
      renderSafeCandidate,
      nodes,
    ), fullDiagnostics).toBe(0);
    expect(getDisplayHardQualityGateReport(renderSafeCandidate, nodes, 'polished').hardClean,
      fullDiagnostics).toBe(true);
    expect(passageDiagnostics.acceptedCandidateCount).toBe(1);
  }, 60_000);
});
