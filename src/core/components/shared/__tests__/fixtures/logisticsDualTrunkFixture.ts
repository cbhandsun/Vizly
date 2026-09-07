import { parseBaseReactFlowPrecompiledRoutePatches } from '../../baseReactFlowPrecompiledRouteArtifact';
import capturedRoutes from './logisticsDualTrunkRoute.json';

/**
 * Geometry from the accepted pre-migration logistics artifact at ff73a933.
 * Keep the four-member source/three-member target paint regression independent
 * of a fresh optimizer's choice of port sectors. This is not a runtime cache.
 */
export const getCapturedLogisticsDualTrunkEdges = () => {
  const edges = parseBaseReactFlowPrecompiledRoutePatches(capturedRoutes);
  if (!edges) throw new Error('Invalid captured logistics dual-trunk routes');
  return edges;
};
