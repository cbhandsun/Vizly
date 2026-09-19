import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { waitForDisplayRoutingBrowserValue } from './lib/display-routing-browser-wait.mjs';
import { PRECOMPILED_DISPLAY_ROUTE_BROWSER_CAPTURE_SCRIPT } from './lib/precompiled-display-route-browser-capture.mjs';

import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import {
  clickPrecompiledDisplayRouteLayoutVariant,
  precompiledLayoutCommandSurfaceReady,
} from './lib/precompiled-display-route-layout-capture.mjs';
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
import {
  mapPrecompiledManifestEntriesByTarget,
  precompiledManifestArtifactFileSetIsFresh,
  precompiledDisplayRouteTargetKey,
  selectChangedPrecompiledDisplayRouteTargets,
} from './lib/precompiled-display-route-changed-targets.mjs';

const ROOT = resolve(process.cwd());
const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
const CHECK_MODE = process.argv.includes('--check');
const TRACE_ALL = process.argv.includes('--trace-all');
const MACHINE_MODE = process.argv.includes('--machine');
const MEASURE_ONLY = process.argv.includes('--measure-only');
const INCLUDE_LAYOUT_VARIANTS = process.argv.includes('--include-layout-variants');
const CHANGED_ONLY = process.argv.includes('--changed-only');
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

const captureTarget = async (session, target, source, routingVersion, routingSourceHash) => {
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
    // Layout variants intentionally start from the preset canvas and then
    // issue a concrete layout command. Some presets can reject their initial
    // automatic route before that command runs, so readiness here is the
    // bounded UI command surface rather than a successful initial route.
    await waitForDisplayRoutingBrowserValue(session, `(() => {
      const ready = ${precompiledLayoutCommandSurfaceReady.toString()};
      return ready({
        readyState: document.readyState,
        routingStage: window.__vizlyBaseReactFlowDisplayRouting?.stage,
        hasLayoutTrigger: Array.from(document.querySelectorAll('button')).some(
          button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''),
        ),
        hasStableLayoutSelection: Array.from(document.querySelectorAll('button')).some(
          button => button.hasAttribute('data-flowchart-layout-selection'),
        ),
      });
    })()`, Math.max(0, deadline - Date.now()));
    await clickPrecompiledDisplayRouteLayoutVariant(session, variantId);
  }
  const captured = await waitForDisplayRoutingBrowserValue(session,
    renderPrecompiledDisplayRouteCaptureExpression(preset.id, variantId),
    Math.max(0, deadline - Date.now()), { stopOnQualityRejection: true });
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
          workItemCount: trace.workItemCount,
          processedEdgeCount: trace.processedEdgeCount,
          passCount: trace.passCount,
          deduplicatedCandidateCount: trace.deduplicatedCandidateCount,
          scalarCandidateCount: trace.scalarCandidateCount,
          channelCandidateCount: trace.channelCandidateCount,
          outerLaneCandidateCount: trace.outerLaneCandidateCount,
          tinyLaneCandidateCount: trace.tinyLaneCandidateCount,
          obstacleLaneCandidateCount: trace.obstacleLaneCandidateCount,
          endpointLaneCandidateCount: trace.endpointLaneCandidateCount,
          endpointOffsetCandidateCount: trace.endpointOffsetCandidateCount,
          terminalBridgeCandidateCount: trace.terminalBridgeCandidateCount,
          returnCandidateCount: trace.returnCandidateCount,
          budgetCount: trace.budgetCount,
          underBudgetCount: trace.underBudgetCount,
          minimumCandidateCount: trace.minimumCandidateCount,
          maximumCandidateCount: trace.maximumCandidateCount,
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
      routingSourceHash,
      sourceHash: hashPrecompiledDisplayRouteSource(source),
      inputSignature: routing.signature,
      inputGeometryDigest,
      outputRouteSignature,
      hardClean: true,
      ...(captured.routingContract ? { routingContract: captured.routingContract } : {}),
      patches,
    },
    measurement: {
      workerResolution,
      provenance,
      workerStartCount: routing.workerStartCount,
      workerAbortCount: routing.workerAbortCount,
      routeMs: routing.routeMs,
      workerDurationMs,
      workerTimings: captured.workerTimings,
      workerExecution: captured.workerExecution,
      mainThreadLongTasks: captured.mainThreadLongTasks,
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

const readExistingManifest = async () => {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
};

const main = async () => {
  if (CHANGED_ONLY && (CHECK_MODE || MEASURE_ONLY)) {
    throw new Error('--changed-only can only be used for artifact generation');
  }
  const availableTargets = MEASURE_ONLY
    ? PRECOMPILED_DISPLAY_ROUTE_TARGETS
    : (INCLUDE_LAYOUT_VARIANTS
      ? PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS
      : PRECOMPILED_DISPLAY_ROUTE_TARGETS);
  let captureTargets = selectPrecompiledDisplayRouteCaptureTargets({
    measureOnly: MEASURE_ONLY,
    checkMode: CHECK_MODE,
    presetId: process.env.PRECOMPILED_ROUTE_PRESET_ID,
    targets: availableTargets,
  });
  const routingVersion = await readRoutingVersion();
  const routingSourceHash = await computePrecompiledDisplayRoutingSourceHash(ROOT);
  const identitySourceHash = hashPrecompiledDisplayRouteSource(await readFile(INPUT_IDENTITY_PATH, 'utf8'));
  const targetSources = await Promise.all(availableTargets.map(async target => ({
    target,
    source: await readFile(resolve(ROOT, target.sourcePath), 'utf8'),
  })));
  const sourceByTargetKey = new Map(targetSources.map(item => [
    precompiledDisplayRouteTargetKey(item.target),
    item.source,
  ]));
  const sourceHashes = new Map(targetSources.map(item => [
    item.target.sourcePath,
    hashPrecompiledDisplayRouteSource(item.source),
  ]));
  const existingManifest = await readExistingManifest();
  if (CHANGED_ONLY) {
    captureTargets = selectChangedPrecompiledDisplayRouteTargets({
      targets: captureTargets,
      manifest: existingManifest,
      routingVersion,
      identitySourceHash,
      routingSourceHash,
      sourceHashes,
    });
    if (captureTargets.length === 0) {
      const existingArtifactFiles = await listGeneratedArtifactFiles();
      if (precompiledManifestArtifactFileSetIsFresh({
        manifest: existingManifest,
        artifactFiles: existingArtifactFiles,
      })) {
        console.log('No changed precompiled route target detected; existing artifacts were left untouched.');
        return;
      }
      captureTargets = availableTargets;
      console.log('Precompiled route artifact file set is stale; regenerating all targets.');
    }
    console.log(`Changed precompiled route target(s): ${
      captureTargets.map(target => `${target.presetId}:${target.variantId}`).join(', ')
    }.`);
  }
  await assertProductionPreview();
  const sources = captureTargets.map(target => ({
    target,
    source: sourceByTargetKey.get(precompiledDisplayRouteTargetKey(target)),
  }));
  if (sources.some(item => typeof item.source !== 'string')) {
    throw new Error('Precompiled route source selection failed');
  }
  const captures = await withPrecompiledRouteBrowser(async session => {
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: PRECOMPILED_DISPLAY_ROUTE_BROWSER_CAPTURE_SCRIPT });
    const generated = [];
    for (const item of sources) {
      generated.push(await captureTarget(
        session,
        item.target,
        item.source,
        routingVersion,
        routingSourceHash,
      ));
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
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const entries = [];
  const artifactContents = new Map();
  const exactIdentities = new Set();
  const variants = new Set();
  const signatureCounts = new Map();
  const capturedTargetKeys = new Set(captureTargets.map(precompiledDisplayRouteTargetKey));
  const existingEntriesByTarget = mapPrecompiledManifestEntriesByTarget(existingManifest);
  if (CHANGED_ONLY && existingManifest) {
    for (const target of availableTargets) {
      if (capturedTargetKeys.has(precompiledDisplayRouteTargetKey(target))) continue;
      const existingEntry = existingEntriesByTarget.get(precompiledDisplayRouteTargetKey(target));
      if (!existingEntry) continue;
      signatureCounts.set(
        existingEntry.inputSignature,
        (signatureCounts.get(existingEntry.inputSignature) ?? 0) + 1,
      );
    }
  }
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
  if (CHANGED_ONLY && existingManifest) {
    for (const target of availableTargets) {
      if (capturedTargetKeys.has(precompiledDisplayRouteTargetKey(target))) continue;
      const entry = existingEntriesByTarget.get(precompiledDisplayRouteTargetKey(target));
      if (!entry) continue;
      if (exactIdentities.has(`${entry.inputSignature}\u0000${entry.inputGeometryDigest}`)) {
        throw new Error(`Duplicate precompiled route identity ${entry.inputSignature}`);
      }
      const variantKey = `${entry.presetId}\u0000${entry.variantId}`;
      if (variants.has(variantKey)) {
        throw new Error(`Duplicate precompiled route variant ${entry.presetId}:${entry.variantId}`);
      }
      exactIdentities.add(`${entry.inputSignature}\u0000${entry.inputGeometryDigest}`);
      variants.add(variantKey);
      entries.push(entry);
      artifactContents.set(
        entry.artifactFile,
        await readFile(resolveGeneratedArtifactPath(entry.artifactFile), 'utf8'),
      );
    }
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
  const loaderContents = renderPrecompiledRouteLoaders(entries, { routingSourceHash });
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
