const targetKey = target => `${target?.sourcePath}\u0000${target?.variantId}`;

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ARTIFACT_FILE_PATTERN = /^route-\d{1,10}(?:-[0-9a-f]{32})?\.json$/;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;
const GEOMETRY_DIGEST_PATTERN = /^geometry-v1:[0-9a-f]{32}$/;
const OUTPUT_ROUTE_SIGNATURE_PATTERN = /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/;
const VARIANT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const entryHasReusableTargetIdentity = entry => (
  isRecord(entry)
  && typeof entry.presetId === 'string'
  && typeof entry.sourcePath === 'string'
  && typeof entry.variantId === 'string'
  && VARIANT_ID_PATTERN.test(entry.variantId)
  && typeof entry.artifactFile === 'string'
  && ARTIFACT_FILE_PATTERN.test(entry.artifactFile)
  && typeof entry.sourceHash === 'string'
  && typeof entry.inputSignature === 'string'
  && INPUT_SIGNATURE_PATTERN.test(entry.inputSignature)
  && typeof entry.inputGeometryDigest === 'string'
  && GEOMETRY_DIGEST_PATTERN.test(entry.inputGeometryDigest)
  && typeof entry.outputRouteSignature === 'string'
  && OUTPUT_ROUTE_SIGNATURE_PATTERN.test(entry.outputRouteSignature)
);

export const selectChangedPrecompiledDisplayRouteTargets = ({
  targets,
  manifest,
  routingVersion,
  identitySourceHash,
  routingSourceHash,
  sourceHashes,
}) => {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('Precompiled changed-target selection requires targets');
  }
  if (!(sourceHashes instanceof Map)) {
    throw new Error('Precompiled changed-target selection requires source hashes');
  }
  if (
    !isRecord(manifest)
    || manifest.routingVersion !== routingVersion
    || manifest.identitySourceHash !== identitySourceHash
    || manifest.routingSourceHash !== routingSourceHash
    || !Array.isArray(manifest.entries)
  ) return targets;

  const entriesByTarget = new Map();
  for (const entry of manifest.entries) {
    if (!entryHasReusableTargetIdentity(entry)) return targets;
    const entryTargetKey = targetKey(entry);
    if (entriesByTarget.has(entryTargetKey)) return targets;
    entriesByTarget.set(entryTargetKey, entry);
  }

  return targets.filter((target) => {
    const entry = entriesByTarget.get(targetKey(target));
    if (!entry) return true;
    const sourceHash = sourceHashes.get(target.sourcePath);
    return typeof sourceHash !== 'string'
      || entry.presetId !== target.presetId
      || entry.sourceHash !== sourceHash
      || !entryHasReusableTargetIdentity(entry);
  });
};

export const mapPrecompiledManifestEntriesByTarget = manifest => {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  return new Map(entries.filter(isRecord).map(entry => [targetKey(entry), entry]));
};

export const precompiledDisplayRouteTargetKey = targetKey;

export const precompiledManifestArtifactFileSetIsFresh = ({
  manifest,
  artifactFiles,
}) => {
  if (!Array.isArray(artifactFiles) || !Array.isArray(manifest?.entries)) return false;
  const expectedArtifactFiles = [];
  for (const entry of manifest.entries) {
    if (!entryHasReusableTargetIdentity(entry)) return false;
    expectedArtifactFiles.push(entry.artifactFile);
  }
  expectedArtifactFiles.sort();
  const actualArtifactFiles = [...artifactFiles].sort();
  return expectedArtifactFiles.join('\n') === actualArtifactFiles.join('\n');
};
