import type {
  DisplayEdgesWorkerRouteResolution,
  DisplayQualityMode,
} from './baseReactFlowDisplayWorkerProtocol';

export const shouldRepairBaseReactFlowDisplayResult = ({
  hardClean,
}: {
  qualityMode: DisplayQualityMode;
  hardClean: boolean;
}): boolean => !hardClean;

export const canCommitBaseReactFlowDisplayResult = ({
  qualityMode,
  hardClean,
  routeResolution,
  routesMatch,
}: {
  qualityMode: DisplayQualityMode;
  hardClean: boolean;
  routeResolution: DisplayEdgesWorkerRouteResolution;
  routesMatch: boolean;
}): boolean => {
  // Quality mode and route resolution describe how a candidate was produced;
  // neither is permission to display a route that failed the hard gate.
  void qualityMode;
  void routeResolution;
  return routesMatch && hardClean;
};
