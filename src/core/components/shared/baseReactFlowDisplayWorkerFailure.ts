import type { Edge, Node } from '@xyflow/react';

import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';

export const createDisplayWorkerFinalQualityError = (
  edges: Edge[],
  nodes: Node[],
): Error => {
  const reportNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node])),
  );
  const report = getDisplayHardQualityGateReport(edges, reportNodes, 'polished');
  const quality = report.quality;
  return new Error([
    'display-edge-worker-final-quality-failed',
    `obstacle=${report.obstacleHits}`,
    `attached=${Number(report.terminalsAttached)}`,
    `anchored=${Number(report.terminalsAnchored)}`,
    `orthogonal=${quality.nonOrthogonalSegments}`,
    `strict=${quality.strictCrossings}`,
    `reverse=${quality.reverseOverlap}`,
    `unrelated=${quality.unrelatedOverlap}`,
    `unexplained=${quality.unexplainedRelatedOverlap}`,
    `short=${quality.shortEndpointStubs}`,
    `tiny=${quality.tinyInteriorDoglegs}`,
    `hairpins=${quality.hairpins}`,
  ].join(':'));
};
