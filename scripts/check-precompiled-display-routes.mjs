import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

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

const ROOT = resolve(process.cwd());
const GENERATED_DIR = resolve(ROOT, 'src/core/components/shared/generated');
const MANIFEST_PATH = resolve(GENERATED_DIR, 'baseReactFlowPrecompiledRouteManifest.json');
const ROUTING_VERSION_PATH = resolve(ROOT, 'src/core/routing/routingVersion.ts');
const INPUT_IDENTITY_PATH = resolve(
  ROOT,
  'src/core/components/shared/baseReactFlowDisplayInputIdentity.ts',
);
const LOADERS_PATH = resolve(GENERATED_DIR, 'baseReactFlowPrecompiledRouteLoaders.ts');
const ARTIFACT_DIR = resolve(GENERATED_DIR, 'precompiledRoutes');
const ARTIFACT_SCHEMA = 'vizly-precompiled-display-route-v1';
const MANIFEST_SCHEMA = 'vizly-precompiled-display-route-manifest-v3';
const MAX_ARTIFACT_BYTES = 2_000_000;
const ARTIFACT_FILE_PATTERN = /^route-\d{1,10}(?:-[0-9a-f]{32})?\.json$/;

const routingSource = await readFile(ROUTING_VERSION_PATH, 'utf8');
const routingVersion = routingSource.match(/EDGE_ROUTING_CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!routingVersion) throw new Error('EDGE_ROUTING_CACHE_VERSION could not be read');
const identitySourceHash = hashPrecompiledDisplayRouteSource(await readFile(INPUT_IDENTITY_PATH, 'utf8'));
const routingSourceHash = await computePrecompiledDisplayRoutingSourceHash(ROOT);

const manifestSource = await readFile(MANIFEST_PATH, 'utf8');
const manifest = JSON.parse(manifestSource);
if (
  manifest?.schema !== MANIFEST_SCHEMA
  || manifest.routingVersion !== routingVersion
  || manifest.identitySourceHash !== identitySourceHash
  || manifest.routingSourceHash !== routingSourceHash
  || !Array.isArray(manifest.entries)
  || manifest.entries.length < PRECOMPILED_DISPLAY_ROUTE_TARGETS.length
  || manifest.entries.length > PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS.length
) throw new Error('Precompiled route manifest is stale or malformed');
if (manifestSource !== renderPrecompiledRouteManifest(manifest)) {
  throw new Error('Precompiled route manifest is not canonical');
}

const targetKey = (sourcePath, variantId) => `${sourcePath}\u0000${variantId}`;
const allowedTargets = new Map(PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS.map(
  target => [targetKey(target.sourcePath, target.variantId), target.presetId],
));
const requiredInitialTargetKeys = new Set(PRECOMPILED_DISPLAY_ROUTE_TARGETS.map(
  target => targetKey(target.sourcePath, target.variantId),
));
const foundTargetKeys = new Set();
const exactIdentities = new Set();
const variants = new Set();
const artifactFiles = new Set();
let previousSortKey = '';
for (const entry of manifest.entries) {
  const entryTargetKey = targetKey(entry?.sourcePath, entry?.variantId);
  const expectedPresetId = allowedTargets.get(entryTargetKey);
  const exactIdentity = `${entry?.inputSignature}\u0000${entry?.inputGeometryDigest}`;
  const variantKey = `${entry?.presetId}\u0000${entry?.variantId}`;
  const sortKey = `${entry?.inputSignature}\u0000${entry?.inputGeometryDigest}`
    + `\u0000${entry?.presetId}\u0000${entry?.variantId}`;
  if (
    !entry
    || typeof entry !== 'object'
    || typeof expectedPresetId !== 'string'
    || entry.presetId !== expectedPresetId
    || typeof entry.variantId !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.variantId)
    || variants.has(variantKey)
    || foundTargetKeys.has(entryTargetKey)
    || typeof entry.artifactFile !== 'string'
    || !ARTIFACT_FILE_PATTERN.test(entry.artifactFile)
    || artifactFiles.has(entry.artifactFile)
    || typeof entry.inputSignature !== 'string'
    || !/^\d{1,10}$/.test(entry.inputSignature)
    || exactIdentities.has(exactIdentity)
    || !/^geometry-v1:[0-9a-f]{32}$/.test(entry.inputGeometryDigest)
    || !/^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(entry.outputRouteSignature)
    || (previousSortKey && previousSortKey.localeCompare(sortKey) >= 0)
  ) throw new Error('Precompiled route manifest entry is malformed');
  variants.add(variantKey);
  foundTargetKeys.add(entryTargetKey);
  exactIdentities.add(exactIdentity);
  artifactFiles.add(entry.artifactFile);
  previousSortKey = sortKey;
  const source = await readFile(resolve(ROOT, entry.sourcePath), 'utf8');
  const sourcePreset = JSON.parse(source);
  if (sourcePreset?.id !== entry.presetId) {
    throw new Error(`Precompiled route source preset id mismatch for ${entry.sourcePath}`);
  }
  const expectedSourceHash = hashPrecompiledDisplayRouteSource(source);
  const artifactPath = resolve(ARTIFACT_DIR, entry.artifactFile);
  const artifactSource = await readFile(artifactPath, 'utf8');
  if (Buffer.byteLength(artifactSource, 'utf8') > MAX_ARTIFACT_BYTES) {
    throw new Error(`Precompiled route artifact ${entry.artifactFile} exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  }
  const artifact = JSON.parse(artifactSource);
  const artifactKeys = Object.keys(artifact || {});
  if (
    artifactKeys.length !== 8
    || ![
      'schema',
      'routingVersion',
      'sourceHash',
      'inputSignature',
      'inputGeometryDigest',
      'outputRouteSignature',
      'hardClean',
      'patches',
    ].every(key => artifactKeys.includes(key))
    || artifact?.schema !== ARTIFACT_SCHEMA
    || artifact.routingVersion !== routingVersion
    || artifact.sourceHash !== expectedSourceHash
    || entry.sourceHash !== expectedSourceHash
    || artifact.inputSignature !== entry.inputSignature
    || artifact.inputGeometryDigest !== entry.inputGeometryDigest
    || artifact.outputRouteSignature !== entry.outputRouteSignature
    || artifact.hardClean !== true
    || !Array.isArray(artifact.patches)
    || artifact.patches.length === 0
  ) throw new Error(`Precompiled route artifact ${entry.artifactFile} is stale or malformed`);
  const commercialIssues = auditPrecompiledDisplayRouteCommercialQuality(artifact.patches);
  if (commercialIssues.length > 0) {
    throw new Error(
      `Precompiled route artifact ${entry.artifactFile} failed commercial quality: `
      + JSON.stringify(commercialIssues),
    );
  }
  if (artifactSource !== renderPrecompiledRouteArtifact(artifact)) {
    throw new Error(`Precompiled route artifact ${entry.artifactFile} is not canonical`);
  }
}
if ([...requiredInitialTargetKeys].some(key => !foundTargetKeys.has(key))) {
  throw new Error('Precompiled route manifest is missing an initial target');
}

const existingArtifactFiles = (await readdir(ARTIFACT_DIR))
  .filter(file => ARTIFACT_FILE_PATTERN.test(file))
  .sort();
const expectedArtifactFiles = [...artifactFiles].sort();
if (existingArtifactFiles.join('\n') !== expectedArtifactFiles.join('\n')) {
  throw new Error('Precompiled route artifact directory contains stale generated files');
}
const loaderSource = await readFile(LOADERS_PATH, 'utf8');
if (loaderSource !== renderPrecompiledRouteLoaders(manifest.entries)) {
  throw new Error('Precompiled route loader registry is stale or non-canonical');
}

console.log(`Precompiled route artifacts passed (${manifest.entries.length} entry).`);
