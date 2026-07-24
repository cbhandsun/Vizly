// @vitest-environment jsdom

import { describe, it } from 'vitest';

import logisticsPlanningStandardData from '../../../../data/standardized/LogisticsPlanningStandardData.json';
import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import systemsInteractionStandardData from '../../../../data/standardized/SystemsInteractionStandardData.json';
import tmsStandardData from '../../../../data/standardized/TmsStandardData.json';
import transportDrivenStandardData from '../../../../data/standardized/TransportDrivenStandardData.json';
import wmsProcessFlowStandardData from '../../../../data/standardized/WmsProcessFlowStandardData.json';
import wmsStandardData from '../../../../data/standardized/WmsStandardData.json';
import { assertBaseReactFlowDisplayQualityGates } from './baseReactFlowDisplayQualityGateAssertions';

describe('baseReactFlowDisplayEdges quality gates', () => {
  const datasets = [
    systemsInteractionStandardData,
    logisticsStandardData,
    transportDrivenStandardData,
    logisticsPlanningStandardData,
    tmsStandardData,
    wmsStandardData,
    wmsProcessFlowStandardData,
  ].map(dataset => [(dataset as { name: string }).name, dataset] as const);

  it.each(datasets)(
    'keeps standard diagram under the hard edge-quality gates: %s',
    async (_name, dataset) => {
      await assertBaseReactFlowDisplayQualityGates(dataset);
    },
    600_000,
  );
});
