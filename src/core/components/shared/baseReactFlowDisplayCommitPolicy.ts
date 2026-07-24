import type {
  DisplayEdgesWorkerRouteResolution,
  DisplayQualityMode,
} from './baseReactFlowDisplayWorkerProtocol';

export const shouldRepairBaseReactFlowDisplayResult = ({
  qualityMode,
  hardClean,
}: {
  qualityMode: DisplayQualityMode;
  hardClean: boolean;
}): boolean => qualityMode === 'full' && !hardClean;

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
}): boolean => routesMatch && (
  hardClean
  || (
    qualityMode === 'interactive'
    && routeResolution === 'full-route'
  )
);
