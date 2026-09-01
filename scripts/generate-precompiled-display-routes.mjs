import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import { clickPrecompiledDisplayRouteLayoutVariant } from './lib/precompiled-display-route-layout-capture.mjs';
import {
  isFreshFullRouteResolution,
  renderPrecompiledDisplayRouteCaptureExpression,
} from './lib/precompiled-display-route-capture.mjs';
import {
  renderPrecompiledRouteArtifact,
  renderPrecompiledRouteLoaders,
  renderPrecompiledRouteManifest,
} from './lib/precompiled-display-route-render.mjs';
import {
  PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS,
  PRECOMPILED_DISPLAY_ROUTE_TARGETS,
} from './lib/precompiled-display-route-targets.mjs';
import { hashPrecompiledDisplayRouteSource } from './lib/precompiled-display-route-source-hash.mjs';
import { computePrecompiledDisplayRoutingSourceHash } from './lib/precompiled-display-route-source-set.mjs';
import { auditPrecompiledDisplayRouteCommercialQuality } from './lib/precompiled-display-route-commercial-quality.mjs';
import {
  buildPrecompiledDisplayRoutePerformanceResult,
  PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX,
  selectPrecompiledDisplayRouteCaptureTargets,
} from './lib/precompiled-display-route-performance.mjs';

const ROOT = resolve(process.cwd());
const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
const CHECK_MODE = process.argv.includes('--check');
const TRACE_ALL = process.argv.includes('--trace-all');
const MACHINE_MODE = process.argv.includes('--machine');
const MEASURE_ONLY = process.argv.includes('--measure-only');
const INCLUDE_LAYOUT_VARIANTS = process.argv.includes('--include-layout-variants');
const GENERATED_DIR = resolve(ROOT, 'src/core/components/shared/generated');
const ARTIFACT_DIR = resolve(GENERATED_DIR, 'precompiledRoutes');
const MANIFEST_PATH = resolve(GENERATED_DIR, 'baseReactFlowPrecompiledRouteManifest.json');
const LOADERS_PATH = resolve(GENERATED_DIR, 'baseReactFlowPrecompiledRouteLoaders.ts');
const SCHEMA = 'vizly-precompiled-display-route-v1';
const MANIFEST_SCHEMA = 'vizly-precompiled-display-route-manifest-v3';
const MAX_ARTIFACT_BYTES = 2_000_000;
const ARTIFACT_FILE_PATTERN = /^route-\d{1,10}(?:-[0-9a-f]{32})?\.json$/;
const ROUTING_VERSION_PATH = resolve(ROOT, 'src/core/routing/routingVersion.ts');
const INPUT_IDENTITY_PATH = resolve(
  ROOT,
  'src/core/components/shared/baseReactFlowDisplayInputIdentity.ts',
);

const readGenerationTimeoutMs = () => {
  const raw = process.env.PRECOMPILED_ROUTE_TIMEOUT_MS;
  if (typeof raw === 'undefined' || raw.trim() === '') return 360_000;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 30_000 || parsed > 600_000) {
    throw new Error('PRECOMPILED_ROUTE_TIMEOUT_MS must be an integer from 30000 to 600000');
  }
  return parsed;
};

const readRoutingVersion = async () => {
  const source = await readFile(ROUTING_VERSION_PATH, 'utf8');
  const match = source.match(/EDGE_ROUTING_CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('EDGE_ROUTING_CACHE_VERSION could not be read');
  return match[1];
};

const writeAtomic = async (path, contents) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, path);
};

const captureScript = `(() => {
  const NativeWorker = window.Worker;
  window.__vizlyDisplayRoutingDiagnosticsEnabled = true;
  window.__vizlyPrecompiledRouteRequest = null;
  window.__vizlyPrecompiledRouteResponse = null;
  window.__vizlyPrecompiledCommittedRoute = null;
  window.__vizlyPrecompiledRouteWorkerErrors = [];
  window.__vizlyPrecompiledRoutePageErrors = [];
  const recordPageError = value => {
    window.__vizlyPrecompiledRoutePageErrors.push(String(value || 'page-error').slice(0, 256));
    window.__vizlyPrecompiledRoutePageErrors = window.__vizlyPrecompiledRoutePageErrors.slice(-8);
  };
  window.addEventListener('error', event => recordPageError(event?.message));
  window.addEventListener('unhandledrejection', event => recordPageError(event?.reason));
  class CapturingWorker extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        const response = event?.data;
        const request = window.__vizlyPrecompiledRouteRequest;
        if (response && request && response.requestId === request.requestId) {
          try { window.__vizlyPrecompiledRouteResponse = structuredClone(response); } catch {}
        }
      });
      this.addEventListener('error', event => {
        window.__vizlyPrecompiledRouteWorkerErrors.push({
          message: String(event?.message || 'worker-error').slice(0, 256),
          line: Number.isFinite(event?.lineno) ? event.lineno : null,
          column: Number.isFinite(event?.colno) ? event.colno : null,
        });
        window.__vizlyPrecompiledRouteWorkerErrors =
          window.__vizlyPrecompiledRouteWorkerErrors.slice(-8);
      });
      this.addEventListener('messageerror', () => {
        window.__vizlyPrecompiledRouteWorkerErrors.push({
          message: 'worker-message-deserialization-failed',
          line: null,
          column: null,
        });
        window.__vizlyPrecompiledRouteWorkerErrors =
          window.__vizlyPrecompiledRouteWorkerErrors.slice(-8);
      });
    }
    postMessage(message, transfer) {
      if (message && (message.operation === 'route' || message.operation === 'validate-or-route')) {
        try { window.__vizlyPrecompiledRouteRequest = structuredClone(message); } catch {}
      }
      return typeof transfer === 'undefined'
        ? super.postMessage(message)
        : super.postMessage(message, transfer);
    }
  }
  window.Worker = CapturingWorker;
})()`;

const captureTarget = async (session, target, source, routingVersion) => {
  const preset = JSON.parse(source);
  if (!preset || typeof preset.id !== 'string' || !preset.id) {
    throw new Error(`${target.sourcePath} does not contain a preset id`);
  }
  if (preset.id !== target.presetId) {
    throw new Error(`${target.sourcePath} preset id does not match ${target.presetId}`);
  }
  const variantId = target.variantId;
  if (
    typeof variantId !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(variantId)
  ) throw new Error(`Invalid precompiled route variant for ${preset.id}`);
  await session.evaluate(`(() => {
    window.__vizlyPrecompiledRouteRequest = null;
    window.__vizlyPrecompiledRouteResponse = null;
    window.__vizlyPrecompiledCommittedRoute = null;
    return true;
  })()`);
  const isLayoutVariant = variantId !== 'initial';
  const url = isLayoutVariant
    ? `${BASE_URL}/?precompiledLayoutRegenerate=${encodeURIComponent(preset.id)}`
      + `&precompiledLayoutVariant=${encodeURIComponent(variantId)}`
      + `#/?diagram=${encodeURIComponent(preset.id)}`
    : `${BASE_URL}/?precompiledCapture=${encodeURIComponent(preset.id)}`
      + `&precompiledRegenerate=${encodeURIComponent(preset.id)}`
      + `#/?diagram=${encodeURIComponent(preset.id)}`;
  await session.send('Page.navigate', { url });
  const deadline = Date.now() + readGenerationTimeoutMs();
  if (isLayoutVariant) {
    let layoutReady = false;
    while (Date.now() < deadline) {
      layoutReady = await session.evaluate(`(() => (
        document.readyState === 'complete'
        && window.__vizlyBaseReactFlowDisplayRouting?.stage === 'final-applied'
        && Array.from(document.querySelectorAll('button')).some(
          button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''),
        )
      ))()`);
      if (layoutReady) break;
      await delay(250);
    }
    if (!layoutReady) {
      throw new Error(`Timed out waiting to apply layout variant ${preset.id}:${variantId}`);
    }
    await clickPrecompiledDisplayRouteLayoutVariant(session, variantId);
  }
  let captured = null;
  while (Date.now() < deadline) {
    try {
      captured = await session.evaluate(renderPrecompiledDisplayRouteCaptureExpression(
        preset.id,
        variantId,
      ));
    } catch {
      captured = null;
    }
    if (captured) break;
    const finalQualityRejected = await session.evaluate(`(() => (
      window.__vizlyBaseReactFlowDisplayRouting?.stage === 'final-quality-rejected'
    ))()`);
    if (finalQualityRejected) break;
    await delay(500);
  }
  if (!captured) {
    const status = await session.evaluate(`(() => {
      const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
      const request = window.__vizlyPrecompiledRouteRequest;
      const response = window.__vizlyPrecompiledRouteResponse;
      const compactEdge = edge => ({
        id: edge?.id,
        source: edge?.source,
        target: edge?.target,
        type: edge?.type,
        sourceHandle: edge?.sourceHandle,
        targetHandle: edge?.targetHandle,
        computedPath: Array.isArray(edge?.data?.computedPath)
          ? edge.data.computedPath
          : null,
        routingData: {
          auto: edge?.data?.auto,
          autoSource: edge?.data?.autoSource,
          autoTarget: edge?.data?.autoTarget,
          layoutDirection: edge?.data?.layoutDirection,
          layoutPathLocked: edge?.data?.layoutPathLocked,
          runtimeHandleLock: edge?.data?.runtimeHandleLock,
          elkPath: Array.isArray(edge?.data?.elkPath) ? edge.data.elkPath : null,
          treeRouting: edge?.data?.treeRouting,
        },
      });
      return {
        stage: routing.stage,
        signature: routing.signature,
        inputGeometryDigest: routing.inputGeometryDigest,
        workerStartCount: routing.workerStartCount,
        workerAbortCount: routing.workerAbortCount,
        routeMs: routing.routeMs,
        requestOperation: request?.operation,
        requestNodes: Array.isArray(request?.nodes) ? request.nodes.length : null,
        requestEdges: Array.isArray(request?.edges) ? request.edges.length : null,
        responseHardClean: response?.hardClean,
        responseRouteResolution: response?.routeResolution,
        committedVariantId: window.__vizlyPrecompiledCommittedRoute?.variantId ?? null,
        committedProvenance: window.__vizlyPrecompiledCommittedRoute?.provenance ?? null,
        responseError: response?.error,
        responsePhaseTrace: Array.isArray(response?.phaseTrace) ? response.phaseTrace : null,
        hardGateDiagnostics: routing.hardGateDiagnostics ?? null,
        terminalDiagnostics: routing.terminalDiagnostics ?? null,
        phaseProgressTrace: Array.isArray(routing.phaseProgressTrace)
          ? routing.phaseProgressTrace
          : null,
        lastPhaseTrace: routing.lastPhaseTrace ?? null,
        requestNodeGeometry: Array.isArray(request?.nodes)
          ? request.nodes.map(node => ({
            id: node?.id,
            parentId: node?.parentId,
            position: node?.position,
            positionAbsolute: node?.positionAbsolute,
            width: node?.width,
            height: node?.height,
            measured: node?.measured,
          }))
          : null,
        requestEdgeRoutes: Array.isArray(request?.edges)
          ? request.edges.map(compactEdge)
          : null,
        responseEdges: Array.isArray(response?.edges)
          ? response.edges.map(compactEdge)
          : null,
        workerErrors: Array.isArray(window.__vizlyPrecompiledRouteWorkerErrors)
          ? window.__vizlyPrecompiledRouteWorkerErrors
          : [],
        pageErrors: Array.isArray(window.__vizlyPrecompiledRoutePageErrors)
          ? window.__vizlyPrecompiledRoutePageErrors
          : [],
        documentState: document.readyState,
        bodyText: document.body?.innerText?.slice(0, 256) ?? null,
      };
    })()`);
    throw new Error(`Timed out generating ${preset.id}:${variantId}: ${JSON.stringify(status)}`);
  }
  const {
    routing,
    patches,
    inputGeometryDigest,
    outputRouteSignature,
    workerResolution,
    workerDurationMs,
    provenance,
  } = captured;
  if (
    routing.routingVersion !== routingVersion
    || captured.variantId !== variantId
    || typeof routing.signature !== 'string'
    || routing.workerStartCount !== 1
    || routing.workerAbortCount !== 0
    || captured.requestShape.operation !== (isLayoutVariant ? 'layout-committed' : 'route')
    || captured.requestShape.candidateEdges !== 0
    || patches.length !== captured.requestShape.edges
  ) throw new Error(`Generated route identity mismatch for ${preset.id}:${variantId}`);
  const commercialIssues = auditPrecompiledDisplayRouteCommercialQuality(patches);
  if (commercialIssues.length > 0) {
    const issueContexts = commercialIssues.map(issue => ({
      ...issue,
      path: patches.find(patch => patch?.id === issue.edgeId)?.data?.computedPath ?? null,
    }));
    throw new Error(
      `Generated route failed commercial quality for ${preset.id}:${variantId}: `
      + JSON.stringify({
        issues: issueContexts,
        workerResolution,
        provenance,
        commercialPhases: Array.isArray(routing.phaseTrace)
          ? routing.phaseTrace.filter(trace => (
            typeof trace?.phase === 'string'
            && (trace.phase.includes('commercial') || trace.phase === 'candidate-validation')
          ))
          : [],
      }),
    );
  }
  console.log(
    `Captured ${preset.id}:${variantId}: ${workerResolution}, workerStart=${routing.workerStartCount}, routeMs=${routing.routeMs}.`,
  );
  const slowestPhases = Array.isArray(routing.phaseTrace)
    ? routing.phaseTrace.slice().sort((left, right) => right.durationMs - left.durationMs).slice(0, 10)
    : [];
  console.log(`Slowest phases for ${preset.id}: ${JSON.stringify(slowestPhases)}`);
  if (TRACE_ALL) {
    const allPhases = Array.isArray(routing.phaseTrace)
      ? routing.phaseTrace.map(trace => ({
          phase: trace.phase,
          parentPhase: trace.parentPhase,
          durationMs: trace.durationMs,
          exclusiveDurationMs: trace.exclusiveDurationMs,
          candidateCount: trace.candidateCount,
          changedEdgeCount: trace.changedEdgeCount,
          evaluationCount: trace.evaluationCount,
          cacheHitCount: trace.cacheHitCount,
          scannedNodeCount: trace.scannedNodeCount,
          scannedSegmentCount: trace.scannedSegmentCount,
          scannedEdgePairCount: trace.scannedEdgePairCount,
          resolution: trace.resolution,
        }))
      : [];
    console.log(`All phases for ${preset.id}: ${JSON.stringify(allPhases)}`);
  }
  if (!MEASURE_ONLY || TRACE_ALL) {
    const seedGatePhases = Array.isArray(routing.phaseTrace)
      ? routing.phaseTrace.filter(trace => (
        trace.phase === 'seed-initial-gate'
      ))
      : [];
    console.log(`Seed gates for ${preset.id}: ${JSON.stringify(seedGatePhases)}`);
    const residualPhases = Array.isArray(routing.phaseTrace)
      ? routing.phaseTrace.filter(trace => trace.phase.startsWith('residual-'))
      : [];
    console.log(`Residual phases for ${preset.id}: ${JSON.stringify(residualPhases)}`);
  }
  return {
    presetId: preset.id,
    variantId,
    artifact: {
      schema: SCHEMA,
      routingVersion,
      sourceHash: hashPrecompiledDisplayRouteSource(source),
      inputSignature: routing.signature,
      inputGeometryDigest,
      outputRouteSignature,
      hardClean: true,
      patches,
    },
    measurement: {
      workerResolution,
      provenance,
      workerStartCount: routing.workerStartCount,
      workerAbortCount: routing.workerAbortCount,
      routeMs: routing.routeMs,
      workerDurationMs,
      phaseTrace: routing.phaseTrace,
    },
  };
};

const assertProductionPreview = async () => {
  if (!BASE_URL) {
    throw new Error(
      'PRECOMPILED_ROUTE_BASE_URL must point to a production `vite preview` server; dev output is not accepted',
    );
  }
  let response;
  try {
    response = await fetch(`${BASE_URL}/`, { redirect: 'follow' });
  } catch {
    throw new Error(`Production preview is not reachable at ${BASE_URL}`);
  }
  if (!response.ok) throw new Error(`Production preview returned HTTP ${response.status}`);
  const html = await response.text();
  const isViteDevelopmentHtml = (
    html.includes('/@vite/client')
    || html.includes('@react-refresh')
    || /<script[^>]+src=["'][^"']*\/src\/(?:main|index)\.[cm]?[jt]sx?["']/i.test(html)
  );
  if (isViteDevelopmentHtml) {
    throw new Error('Refusing to generate precompiled routes from a Vite development server');
  }
  if (!/<script[^>]+src=["'][^"']*\/assets\/[^"']+\.js["']/i.test(html)) {
    throw new Error('PRECOMPILED_ROUTE_BASE_URL does not look like a production Vite preview');
  }
};

const listGeneratedArtifactFiles = async () => {
  try {
    return (await readdir(ARTIFACT_DIR))
      .filter(file => ARTIFACT_FILE_PATTERN.test(file))
      .sort();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
};

const resolveGeneratedArtifactPath = artifactFile => {
  if (!ARTIFACT_FILE_PATTERN.test(artifactFile)) {
    throw new Error(`Unsafe generated artifact filename ${artifactFile}`);
  }
  const absolutePath = resolve(ARTIFACT_DIR, artifactFile);
  if (dirname(absolutePath) !== ARTIFACT_DIR || !absolutePath.startsWith(`${ARTIFACT_DIR}${sep}`)) {
    throw new Error(`Generated artifact path escaped ${ARTIFACT_DIR}`);
  }
  return absolutePath;
};

const assertFileContents = async (path, expected, label) => {
  let actual;
  try {
    actual = await readFile(path, 'utf8');
  } catch {
    throw new Error(`${label} is missing; run the generator without --check`);
  }
  if (actual !== expected) throw new Error(`${label} is not reproducible from the production preview`);
};

const main = async () => {
  const availableTargets = MEASURE_ONLY
    ? PRECOMPILED_DISPLAY_ROUTE_TARGETS
    : (INCLUDE_LAYOUT_VARIANTS
      ? PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS
      : PRECOMPILED_DISPLAY_ROUTE_TARGETS);
  const captureTargets = selectPrecompiledDisplayRouteCaptureTargets({
    measureOnly: MEASURE_ONLY,
    checkMode: CHECK_MODE,
    presetId: process.env.PRECOMPILED_ROUTE_PRESET_ID,
    targets: availableTargets,
  });
  await assertProductionPreview();
  const routingVersion = await readRoutingVersion();
  const sources = await Promise.all(captureTargets.map(async target => ({
    target,
    source: await readFile(resolve(ROOT, target.sourcePath), 'utf8'),
  })));
  const captures = await withPrecompiledRouteBrowser(async session => {
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: captureScript });
    const generated = [];
    for (const item of sources) {
      generated.push(await captureTarget(session, item.target, item.source, routingVersion));
    }
    return generated;
  });
  const isFreshGenerationCapture = capture => (
    capture.variantId === 'initial'
      ? isFreshFullRouteResolution(capture.measurement.workerResolution)
      : capture.measurement.provenance === 'fresh-layout-repair-validated'
        || capture.measurement.provenance === 'fresh-full-route'
  );
  if (MEASURE_ONLY) {
    if (captures.some(capture => !isFreshGenerationCapture(capture))) {
      throw new Error('Focused measurement did not compute a fresh full route');
    }
    console.log(`Measured ${captures.length} precompiled route preset without writing artifacts.`);
    if (MACHINE_MODE) {
      console.log(
        `${PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX}`
        + JSON.stringify(buildPrecompiledDisplayRoutePerformanceResult(captures)),
      );
    }
    return;
  }
  const identitySourceHash = hashPrecompiledDisplayRouteSource(await readFile(INPUT_IDENTITY_PATH, 'utf8'));
  const routingSourceHash = await computePrecompiledDisplayRoutingSourceHash(ROOT);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const entries = [];
  const artifactContents = new Map();
  const exactIdentities = new Set();
  const variants = new Set();
  const signatureCounts = new Map();
  for (const capture of captures) {
    const signature = capture.artifact.inputSignature;
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  }
  for (let index = 0; index < captures.length; index += 1) {
    const artifact = captures[index].artifact;
    const exactIdentity = `${artifact.inputSignature}\u0000${artifact.inputGeometryDigest}`;
    if (exactIdentities.has(exactIdentity)) {
      throw new Error(`Duplicate precompiled route identity ${artifact.inputSignature}`);
    }
    exactIdentities.add(exactIdentity);
    const presetId = captures[index].presetId;
    const variantId = captures[index].variantId;
    const variantKey = `${presetId}\u0000${variantId}`;
    if (variants.has(variantKey)) {
      throw new Error(`Duplicate precompiled route variant ${presetId}:${variantId}`);
    }
    variants.add(variantKey);
    const digestSuffix = artifact.inputGeometryDigest.slice('geometry-v1:'.length);
    const artifactFile = signatureCounts.get(artifact.inputSignature) === 1
      ? `route-${artifact.inputSignature}.json`
      : `route-${artifact.inputSignature}-${digestSuffix}.json`;
    const artifactSource = renderPrecompiledRouteArtifact(artifact);
    if (Buffer.byteLength(artifactSource, 'utf8') > MAX_ARTIFACT_BYTES) {
      throw new Error(`Generated artifact ${artifactFile} exceeds ${MAX_ARTIFACT_BYTES} bytes`);
    }
    artifactContents.set(artifactFile, artifactSource);
    entries.push({
      presetId,
      variantId,
      sourcePath: captureTargets[index].sourcePath,
      artifactFile,
      sourceHash: artifact.sourceHash,
      inputSignature: artifact.inputSignature,
      inputGeometryDigest: artifact.inputGeometryDigest,
      outputRouteSignature: artifact.outputRouteSignature,
    });
  }
  entries.sort((first, second) => (
    first.inputSignature.localeCompare(second.inputSignature)
    || first.inputGeometryDigest.localeCompare(second.inputGeometryDigest)
    || first.presetId.localeCompare(second.presetId)
    || first.variantId.localeCompare(second.variantId)
  ));
  const manifest = {
    schema: MANIFEST_SCHEMA,
    routingVersion,
    identitySourceHash,
    routingSourceHash,
    entries,
  };
  const manifestContents = renderPrecompiledRouteManifest(manifest);
  const loaderContents = renderPrecompiledRouteLoaders(entries);
  const expectedArtifactFiles = [...artifactContents.keys()].sort();
  const existingArtifactFiles = await listGeneratedArtifactFiles();
  if (CHECK_MODE) {
    if (captures.some(capture => !isFreshGenerationCapture(capture))) {
      throw new Error('Production reproducibility check did not compute a fresh full route');
    }
    if (existingArtifactFiles.join('\n') !== expectedArtifactFiles.join('\n')) {
      throw new Error('Generated precompiled route artifact set is stale');
    }
    for (const [artifactFile, contents] of artifactContents) {
      await assertFileContents(
        resolveGeneratedArtifactPath(artifactFile),
        contents,
        `Precompiled route artifact ${artifactFile}`,
      );
    }
    await assertFileContents(MANIFEST_PATH, manifestContents, 'Precompiled route manifest');
    await assertFileContents(LOADERS_PATH, loaderContents, 'Precompiled route loader registry');
    console.log(`Reproduced ${entries.length} precompiled route artifact(s) from production preview.`);
    if (MACHINE_MODE) {
      console.log(
        `${PRECOMPILED_DISPLAY_ROUTE_RESULT_PREFIX}`
        + JSON.stringify(buildPrecompiledDisplayRoutePerformanceResult(captures)),
      );
    }
    return;
  }
  for (const [artifactFile, contents] of artifactContents) {
    await writeAtomic(resolveGeneratedArtifactPath(artifactFile), contents);
  }
  for (const staleArtifact of existingArtifactFiles) {
    if (!artifactContents.has(staleArtifact)) {
      await unlink(resolveGeneratedArtifactPath(staleArtifact));
    }
  }
  await writeAtomic(MANIFEST_PATH, manifestContents);
  await writeAtomic(LOADERS_PATH, loaderContents);
  console.log(`Generated ${entries.length} production precompiled route artifact(s) in ${basename(ARTIFACT_DIR)}.`);
};

await main();
