import type { Edge } from '@xyflow/react';

import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';

const COMMERCIAL_REPAIR_FLAGS = [
  'displayNodeClearanceRepaired',
  'overextendedTargetTrunkCorridorReclaimed',
] as const;

export const commercialRepairOutputIsEquivalent = (
  baseline: Edge[],
  candidate: Edge[],
): boolean => doBaseReactFlowDisplayRoutesMatchExactly(baseline, candidate)
  && baseline.every((edge, index) => COMMERCIAL_REPAIR_FLAGS.every(flag => (
    edge.data?.[flag] === candidate[index]?.data?.[flag]
  )));
