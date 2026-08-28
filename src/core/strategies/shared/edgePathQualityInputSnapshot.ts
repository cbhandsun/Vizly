import type { Edge } from '@xyflow/react';

import { getEdgePath, type Point } from './edgePathQualityGeometry';
import { edgeRoutingExactQualityIntentToken } from './edgeRoutingQualityIntent';

export type QualityInputSnapshot = Readonly<{
  signature: string;
  paths: Point[][];
  edgeSignatures: string[];
}>;

export type QualityEdgeInputSnapshot = Readonly<{
  path: Point[];
  signature: string;
}>;

const encodeSignatureField = (value: string): string => `${value.length}:${value}`;

export const buildQualityInputSignature = (edgeSignatures: readonly string[]): string => (
  edgeSignatures.map(signature => encodeSignatureField(signature)).join('')
);

export const buildQualityEdgeInputSnapshot = (edge: Edge): QualityEdgeInputSnapshot => {
  const path = getEdgePath(edge);
  const intent = edgeRoutingExactQualityIntentToken(edge);
  const pathSignature = path
    .map(point => encodeSignatureField(`${point.x},${point.y}`))
    .join('');
  return {
    path,
    signature: [
      edge.source,
      edge.target,
      edge.sourceHandle ?? '',
      edge.targetHandle ?? '',
      intent,
      pathSignature,
    ].map(value => encodeSignatureField(String(value))).join(''),
  };
};

export const buildQualityInputSnapshot = (edges: Edge[]): QualityInputSnapshot => {
  const edgeSnapshots = edges.map(buildQualityEdgeInputSnapshot);
  return {
    signature: buildQualityInputSignature(edgeSnapshots.map(snapshot => snapshot.signature)),
    paths: edgeSnapshots.map(snapshot => snapshot.path),
    edgeSignatures: edgeSnapshots.map(snapshot => snapshot.signature),
  };
};
