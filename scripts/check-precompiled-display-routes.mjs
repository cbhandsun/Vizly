import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  renderPrecompiledRouteArtifact,
  renderPrecompiledRouteLoaders,
  renderPrecompiledRouteManifest,
} from './lib/precompiled-display-route-render.mjs';
import { PRECOMPILED_DISPLAY_ROUTE_TARGETS } from './lib/precompiled-display-route-targets.mjs';

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
const MANIFEST_SCHEMA = 'vizly-precompiled-display-route-manifest-v2';
const MAX_ARTIFACT_BYTES = 2_000_000;

const sourceHash = value => `source-v1:${createHash('sha256').update(value).digest('hex')}`;

const routingSource = await readFile(ROUTING_VERSION_PATH, 'utf8');
const routingVersion = routingSource.match(/EDGE_ROUTING_CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!routingVersion) throw new Error('EDGE_ROUTING_CACHE_VERSION could not be read');
const identitySourceHash = sourceHash(await readFile(INPUT_IDENTITY_PATH, 'utf8'));

const manifestSource = await readFile(MANIFEST_PATH, 'utf8');
const manifest = JSON.parse(manifestSource);
if (
  manifest?.schema !== MANIFEST_SCHEMA
  || manifest.routingVersion !== routingVersion
  || manifest.identitySourceHash !== identitySourceHash
  || !Array.isArray(manifest.entries)
  || manifest.entries.length !== PRECOMPILED_DISPLAY_ROUTE_TARGETS.length
) throw new Error('Precompiled route manifest is stale or malformed');
if (manifestSource !== renderPrecompiledRouteManifest(manifest)) {
  throw new Error('Precompiled route manifest is not canonical');
}

const expectedTargets = new Map(PRECOMPILED_DISPLAY_ROUTE_TARGETS.map(
  target => [target.sourcePath, target.presetId],
));
const signatures = new Set();
const presetIds = new Set();
const artifactFiles = new Set();
let previousSignature = '';
for (const entry of manifest.entries) {
  const expectedPresetId = expectedTargets.get(entry?.sourcePath);
  if (
    !entry
    || typeof entry !== 'object'
    || typeof expectedPresetId !== 'string'
    || entry.presetId !== expectedPresetId
    || presetIds.has(entry.presetId)
    || !expectedTargets.delete(entry.sourcePath)
    || typeof entry.artifactFile !== 'string'
    || !/^route-\d{1,10}\.json$/.test(entry.artifactFile)
    || artifactFiles.has(entry.artifactFile)
    || typeof entry.inputSignature !== 'string'
    || !/^\d{1,10}$/.test(entry.inputSignature)
    || signatures.has(entry.inputSignature)
    || !/^geometry-v1:[0-9a-f]{32}$/.test(entry.inputGeometryDigest)
    || !/^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(entry.outputRouteSignature)
    || (previousSignature && previousSignature.localeCompare(entry.inputSignature) >= 0)
  ) throw new Error('Precompiled route manifest entry is malformed');
  presetIds.add(entry.presetId);
  signatures.add(entry.inputSignature);
  artifactFiles.add(entry.artifactFile);
  previousSignature = entry.inputSignature;
  const source = await readFile(resolve(ROOT, entry.sourcePath), 'utf8');
  const sourcePreset = JSON.parse(source);
  if (sourcePreset?.id !== entry.presetId) {
    throw new Error(`Precompiled route source preset id mismatch for ${entry.sourcePath}`);
  }
  const expectedSourceHash = sourceHash(source);
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
  if (artifactSource !== renderPrecompiledRouteArtifact(artifact)) {
    throw new Error(`Precompiled route artifact ${entry.artifactFile} is not canonical`);
  }
}
if (expectedTargets.size > 0) throw new Error('Precompiled route manifest is missing a target');

const existingArtifactFiles = (await readdir(ARTIFACT_DIR))
  .filter(file => /^route-\d{1,10}\.json$/.test(file))
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
