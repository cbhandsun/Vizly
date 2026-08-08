import type { ReactNode } from 'react';

const toEditableEdgeLabel = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

export const resolveEditableEdgeLabel = (
  dataLabel: unknown,
  edgeLabel: ReactNode,
): string | undefined => toEditableEdgeLabel(dataLabel) ?? toEditableEdgeLabel(edgeLabel);
