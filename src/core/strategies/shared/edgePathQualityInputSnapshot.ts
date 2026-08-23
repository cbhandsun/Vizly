import type { Edge } from '@xyflow/react';

import { getEdgePath, type Point } from './edgePathQualityGeometry';
import { edgeRoutingQualityIntentToken } from './edgeRoutingQualityIntent';

export type QualityInputSnapshot = Readonly<{
  signature: string;
  paths: Point[][];
  edgeSignatures: string[];
}>;

export type QualityEdgeInputSnapshot = Readonly<{
  path: Point[];
  signature: string;
}>;

export const buildQualityEdgeInputSnapshot = (edge: Edge): QualityEdgeInputSnapshot => {
  const path = getEdgePath(edge);
  const intent = edgeRoutingQualityIntentToken(edge);
  const pathSignature = path.map(point => `${point.x},${point.y}`).join(';');
  return {
    path,
    signature: [
      edge.source,
      edge.target,
      edge.sourceHandle ?? '',
      edge.targetHandle ?? '',
      intent,
      pathSignature,
    ].join('\u001f'),
  };
};

export const buildQualityInputSnapshot = (edges: Edge[]): QualityInputSnapshot => {
  const edgeSnapshots = edges.map(buildQualityEdgeInputSnapshot);
  return {
    signature: edgeSnapshots.map(snapshot => snapshot.signature).join('\u001e'),
    paths: edgeSnapshots.map(snapshot => snapshot.path),
    edgeSignatures: edgeSnapshots.map(snapshot => snapshot.signature),
  };
};
