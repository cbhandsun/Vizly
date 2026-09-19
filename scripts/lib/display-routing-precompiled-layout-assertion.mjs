import { readFile } from 'node:fs/promises';

import { PRECOMPILED_DISPLAY_ROUTE_LAYOUT_TARGETS } from './precompiled-display-route-targets.mjs';

const PRECOMPILED_ROUTE_MANIFEST_PATH = 'src/core/components/shared/generated/baseReactFlowPrecompiledRouteManifest.json';

let precompiledRouteManifestPromise = null;

const readPrecompiledRouteManifest = () => {
  precompiledRouteManifestPromise ??= readFile(PRECOMPILED_ROUTE_MANIFEST_PATH, 'utf8')
    .then(raw => JSON.parse(raw));
  return precompiledRouteManifestPromise;
};

const resolvePrecompiledLayoutManifestEntry = async target => {
  const manifest = await readPrecompiledRouteManifest();
  const entry = Array.isArray(manifest?.entries)
    ? manifest.entries.find(candidate => (
      candidate?.presetId === target.presetId
      && candidate?.variantId === target.variantId
      && candidate?.sourcePath === target.sourcePath
    ))
    : null;
  if (!entry) {
    throw new Error(`Missing generated precompiled layout route manifest entry: ${JSON.stringify(target)}`);
  }
  return entry;
};

const routePhaseTraceHasCandidateHit = route => (
  route?.response?.phaseTrace?.some(trace => (
    trace?.phase === 'candidate-validation' && trace?.resolution === 'hit'
  ))
  || route?.routing?.phaseProgressTrace?.some(trace => (
    trace?.phase === 'candidate-validation' && trace?.resolution === 'hit'
  ))
);

export const assertPrecompiledLayoutRouteUsed = async ({ route, target, layoutCase }) => {
  const entry = await resolvePrecompiledLayoutManifestEntry(target);
  const requestIdentity = route.request?.inputIdentity ?? {};
  const diagnosticTrace = Array.isArray(route.routing?.precompiledRouteDiagnosticTrace)
    ? route.routing.precompiledRouteDiagnosticTrace
    : [];
  const diagnosticTraceHasExpectedHit = diagnosticTrace.some(diagnostic => (
    diagnostic?.reason === 'hit'
    && diagnostic?.inputSignature === entry.inputSignature
    && diagnostic?.inputGeometryDigest === entry.inputGeometryDigest
    && diagnostic?.presetId === target.presetId
    && diagnostic?.variantId === target.variantId
  ));
  const diagnosticSummary = route.routing?.precompiledRouteDiagnosticSummary;
  const diagnosticSummaryHasExpectedHit = (
    typeof diagnosticSummary?.hitCount === 'number'
    && diagnosticSummary.hitCount > 0
    && typeof diagnosticSummary?.reasonCounts?.hit === 'number'
    && diagnosticSummary.reasonCounts.hit > 0
  );
  const observed = {
    presetId: target.presetId,
    variantId: layoutCase.id,
    requestId: route.request?.requestId,
    candidateSource: route.request?.candidateSource,
    routeResolution: route.response?.routeResolution,
    requestInputSignature: requestIdentity.inputSignature,
    requestInputGeometryDigest: requestIdentity.inputGeometryDigest,
    responseOutputRouteSignature: route.response?.outputRouteSignature,
    routingOutputRouteSignature: route.routing?.outputRouteSignature,
    cacheTrustLevel: route.routing?.cacheTrustLevel,
    precompiledRouteDiagnostic: route.routing?.precompiledRouteDiagnostic,
    precompiledRouteDiagnosticTrace: diagnosticTrace,
    precompiledRouteDiagnosticSummary: diagnosticSummary,
    diagnosticTraceHasExpectedHit,
    diagnosticSummaryHasExpectedHit,
    hasCandidateValidationHit: routePhaseTraceHasCandidateHit(route),
  };
  const outputRouteSignature = typeof route.response?.outputRouteSignature === 'string'
    ? route.response.outputRouteSignature
    : route.routing?.outputRouteSignature;
  const usedPrecompiledLayoutRoute = route.request?.candidateSource === 'precompiled'
    && requestIdentity.inputSignature === entry.inputSignature
    && requestIdentity.inputGeometryDigest === entry.inputGeometryDigest
    && outputRouteSignature === entry.outputRouteSignature
    && routePhaseTraceHasCandidateHit(route)
    && diagnosticTraceHasExpectedHit
    && diagnosticSummaryHasExpectedHit;
  if (!usedPrecompiledLayoutRoute) {
    throw new Error(`${target.presetId}:${layoutCase.id} did not use its generated precompiled layout route:\n${JSON.stringify({
      expected: {
        inputSignature: entry.inputSignature,
        inputGeometryDigest: entry.inputGeometryDigest,
        outputRouteSignature: entry.outputRouteSignature,
      },
      observed,
    }, null, 2)}`);
  }
  return observed;
};

export const verifyPrecompiledDisplayRouteLayoutTargets = async ({
  requestedCase,
  layoutCases,
  verifyLayout,
}) => {
  const results = [];
  for (const target of PRECOMPILED_DISPLAY_ROUTE_LAYOUT_TARGETS) {
    const layoutCase = layoutCases.find(candidate => candidate.id === target.variantId);
    if (!layoutCase) throw new Error(`Unknown generated precompiled layout variant: ${target.variantId}`);
    if (!requestedCase || requestedCase === target.variantId || requestedCase === target.presetId) {
      results.push(await verifyLayout(layoutCase, {
        presetId: target.presetId,
        expectedPrecompiledLayoutTarget: target,
      }));
    }
  }
  return results;
};

export const verifyDisplayRoutingMatrixPrecompiledCoverage = async ({
  requestedCase,
  presetTargets,
  layoutCases,
  verifyPreset,
  verifyLayout,
}) => {
  const presetResults = [];
  for (const target of presetTargets) {
    if (!requestedCase || requestedCase === target.presetId) {
      presetResults.push(await verifyPreset(target));
    }
  }
  const layoutResults = [];
  for (const layoutCase of layoutCases) {
    if (!requestedCase || requestedCase === layoutCase.id) {
      layoutResults.push(await verifyLayout(layoutCase));
    }
  }
  const precompiledLayoutResults = await verifyPrecompiledDisplayRouteLayoutTargets({
    requestedCase,
    layoutCases,
    verifyLayout,
  });
  return { presetResults, layoutResults, precompiledLayoutResults };
};
