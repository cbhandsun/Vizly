import demandAllocationArtifact from '../../generated/precompiledRoutes/route-4033567064.json';
import logisticsArtifact from '../../generated/precompiledRoutes/route-2227874906.json';
import wmsProcessArtifact from '../../generated/precompiledRoutes/route-1352090637.json';

const artifactsByPresetId: Readonly<Record<string, unknown>> = {
  'wms-demand-allocation-strategy-v2': demandAllocationArtifact,
  'wms-process-flow-v1': wmsProcessArtifact,
  'logistics-architecture-v1': logisticsArtifact,
};

/** Static test boundary; production route loading remains same-origin fetch-only. */
export const getGeneratedPrecompiledRouteArtifactForTest = (presetId: string): unknown => {
  const artifact = artifactsByPresetId[presetId];
  if (!artifact) throw new Error(`Missing generated precompiled test artifact: ${presetId}`);
  return artifact;
};
