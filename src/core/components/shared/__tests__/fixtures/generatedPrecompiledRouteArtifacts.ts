import manifest from '../../generated/baseReactFlowPrecompiledRouteManifest.json';

const artifactModules = import.meta.glob('../../generated/precompiledRoutes/route-*.json', {
  eager: true,
  import: 'default',
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const artifactsByPresetId: Readonly<Record<string, unknown>> = Object.fromEntries(
  (Array.isArray(manifest.entries) ? manifest.entries : []).flatMap(entry => {
    if (
      !isRecord(entry)
      || typeof entry.presetId !== 'string'
      || typeof entry.artifactFile !== 'string'
      || !/^route-\d{1,10}\.json$/.test(entry.artifactFile)
    ) return [];
    const moduleEntry = Object.entries(artifactModules)
      .find(([path]) => path.endsWith(`/${entry.artifactFile}`));
    return moduleEntry ? [[entry.presetId, moduleEntry[1]]] : [];
  }),
);

/** Static test boundary; production route loading remains same-origin fetch-only. */
export const getGeneratedPrecompiledRouteArtifactForTest = (presetId: string): unknown => {
  const artifact = artifactsByPresetId[presetId];
  if (!artifact) throw new Error(`Missing generated precompiled test artifact: ${presetId}`);
  return artifact;
};
