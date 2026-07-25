import type { Edge } from '@xyflow/react';

export const readDisplayLayoutDirection = (edge: Edge | undefined): string => {
  const direction = edge?.data?.layoutDirection;
  return typeof direction === 'string' && direction ? direction : 'TB';
};
