import type { Node } from '@xyflow/react';

import { parseDateOnlyTime } from '../../../utils/dateOnly';

type ProTimelineBaselineTransaction = {
  changed: boolean;
  eligibleCount: number;
  nodes: Node[];
};

const validDateOnly = (value: unknown): string | null => (
  typeof value === 'string' && parseDateOnlyTime(value) !== null
    ? value.trim()
    : null
);

export const createProTimelineBaselineSnapshot = (
  nodes: readonly Node[],
): ProTimelineBaselineTransaction => {
  let changed = false;
  let eligibleCount = 0;
  const nextNodes = nodes.map(node => {
    const baselineStartDate = validDateOnly(node.data.date);
    if (!baselineStartDate) return node;

    eligibleCount += 1;
    const baselineEndDate = validDateOnly(node.data.endDate) ?? baselineStartDate;
    if (
      node.data.baselineStartDate === baselineStartDate
      && node.data.baselineEndDate === baselineEndDate
    ) {
      return node;
    }

    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        baselineStartDate,
        baselineEndDate,
      },
    };
  });

  return { changed, eligibleCount, nodes: nextNodes };
};

export const clearProTimelineBaselineSnapshot = (
  nodes: readonly Node[],
): ProTimelineBaselineTransaction => {
  let changed = false;
  const nextNodes = nodes.map(node => {
    if (
      node.data.baselineStartDate === undefined
      && node.data.baselineEndDate === undefined
    ) {
      return node;
    }

    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        baselineStartDate: undefined,
        baselineEndDate: undefined,
      },
    };
  });

  return { changed, eligibleCount: 0, nodes: nextNodes };
};
