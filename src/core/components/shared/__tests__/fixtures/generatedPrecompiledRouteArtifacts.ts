import manifest from '../../generated/baseReactFlowPrecompiledRouteManifest.json';

const artifactModules = import.meta.glob('../../generated/precompiledRoutes/route-*.json', {
  eager: true,
  import: 'default',
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const artifactKey = (presetId: string, variantId: string): string => (
  `${presetId}\u0000${variantId}`
);

const artifactsByVariant: Readonly<Record<string, unknown>> = Object.fromEntries(
  (Array.isArray(manifest.entries) ? manifest.entries : []).flatMap(entry => {
    if (!isRecord(entry)) return [];
    const entryRecord: Record<string, unknown> = entry;
    if (
      typeof entryRecord.presetId !== 'string'
      || typeof entryRecord.artifactFile !== 'string'
      || !/^route-\d{1,10}(?:-[0-9a-f]{32})?\.json$/.test(entryRecord.artifactFile)
    ) return [];
    const variantId = typeof entryRecord.variantId === 'string'
      ? entryRecord.variantId
      : 'initial';
    const moduleEntry = Object.entries(artifactModules)
      .find(([path]) => path.endsWith(`/${entryRecord.artifactFile}`));
    return moduleEntry
      ? [[artifactKey(entryRecord.presetId, variantId), moduleEntry[1]]]
      : [];
  }),
);

/** Static test boundary; production route loading remains same-origin fetch-only. */
export const getGeneratedPrecompiledRouteArtifactForTest = (
  presetId: string,
  variantId = 'initial',
): unknown => {
  const artifact = artifactsByVariant[artifactKey(presetId, variantId)];
  if (!artifact) {
    throw new Error(`Missing generated precompiled test artifact: ${presetId}:${variantId}`);
  }
  return artifact;
};
