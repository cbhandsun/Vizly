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

export const buildQualityInputSignature = (edgeSignatures: readonly string[]): string => {
  let signature = '';
  for (const edgeSignature of edgeSignatures) {
    signature += encodeSignatureField(edgeSignature);
  }
  return signature;
};

export const buildQualityEdgeInputSnapshot = (edge: Edge): QualityEdgeInputSnapshot => {
  const path = getEdgePath(edge);
  const intent = edgeRoutingExactQualityIntentToken(edge);
  let pathSignature = '';
  for (const point of path) {
    pathSignature += encodeSignatureField(`${point.x},${point.y}`);
  }
  let signature = '';
  signature += encodeSignatureField(String(edge.source));
  signature += encodeSignatureField(String(edge.target));
  signature += encodeSignatureField(String(edge.sourceHandle ?? ''));
  signature += encodeSignatureField(String(edge.targetHandle ?? ''));
  signature += encodeSignatureField(String(intent));
  signature += encodeSignatureField(pathSignature);
  return {
    path,
    signature,
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
