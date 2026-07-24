import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  finalizePhaseTwoSubGroupLayout,
  type PhaseTwoSubGroupOperations,
} from '../domainVerticalPhaseTwoSubGroupLayout';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  y: number,
  children?: string[],
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width: 100, height: 60 },
  style: { width: 100, height: 60 },
  data: { domain, children },
});

const operations = (calls: string[]): PhaseTwoSubGroupOperations => {
  const operation = (name: string) => (nodes: ReactFlowNode[]) => {
    calls.push(name);
    return nodes;
  };
  return {
    purgeSemanticChildren: operation('purge'),
    assignSemanticChildren: operation('assign'),
    recomputeSubGroups: operation('recompute'),
    finalizeSubGroupWidths: operation('widths'),
    finalizeSubGroupHeights: operation('heights'),
    enforceSubGroupContainment: operation('sub-contain'),
    expandSubGroupsBySemantic: operation('expand-semantic'),
    resolveSubGroupOverlaps: (nodes, horizontalGap, verticalGap) => {
      calls.push(`sub-overlap:${horizontalGap}:${verticalGap}`);
      return nodes;
    },
    enforceDomainContainment: operation('domain-contain'),
    resolveFreeNodeOverlaps: (nodes, horizontalGap, verticalGap) => {
      calls.push(`free-overlap:${horizontalGap}:${verticalGap}`);
      return nodes;
    },
    finalizeDomainWidths: operation('domain-widths'),
    unifySubGroupWidths: operation('unify-widths'),
    unifySubGroupGaps: (nodes, horizontalGap, verticalGap) => {
      calls.push(`unify-gaps:${horizontalGap}:${verticalGap}`);
      return nodes;
    },
    unifySubGroupHeights: operation('unify-heights'),
    clampDomainHeights: operation('clamp-domain-heights'),
  };
};

const options = (
  calls: string[],
  layout: 'horizontal' | 'dagre' = 'horizontal',
) => ({
  layout,
  top: 20,
  domainGap: 30,
  domainOrder: ['A'],
  domainHorizontalPadding: 20,
  subGroupHorizontalPadding: 10,
  subGroupTopPadding: 30,
  horizontalGap: 20,
  verticalGap: 10,
  compactVerticalGap: 8,
  fallbackContainerHeight: 80,
  fallbackSubGroupWidth: 100,
  orderOf: () => 0,
  layoutChildren: vi.fn(),
  operations: operations(calls),
});

describe('finalizePhaseTwoSubGroupLayout', () => {
  it('runs semantic binding before child layout and convergence operations', () => {
    const calls: string[] = [];
    const config = options(calls);

    finalizePhaseTwoSubGroupLayout([
      node('domain', 'titleGroup', 'A', 0, 20),
      node('sub', 'subGroup', 'A', 20, 80, ['child']),
      node('child', 'default', 'A', 30, 120),
    ], config);

    expect(calls.slice(0, 5)).toEqual([
      'purge',
      'assign',
      'recompute',
      'widths',
      'heights',
    ]);
    expect(config.layoutChildren).toHaveBeenCalledOnce();
    expect(calls).toContain('unify-gaps:12:6');
    expect(calls.at(-1)).toBe('clamp-domain-heights');
  });

  it('skips semantic and generic height recovery for dagre', () => {
    const calls: string[] = [];

    finalizePhaseTwoSubGroupLayout([
      node('domain', 'titleGroup', 'A', 0, 20),
      node('sub', 'subGroup', 'A', 20, 80),
    ], options(calls, 'dagre'));

    expect(calls).not.toContain('purge');
    expect(calls).not.toContain('assign');
    expect(calls).not.toContain('unify-heights');
    expect(calls.filter(call => call === 'heights')).toHaveLength(1);
    expect(calls.filter(call => call === 'recompute')).toHaveLength(1);
  });

  it('sanitizes invalid spacing without producing non-finite positions', () => {
    const calls: string[] = [];
    const config = {
      ...options(calls),
      top: Number.NaN,
      domainGap: -1,
      horizontalGap: Number.POSITIVE_INFINITY,
      verticalGap: Number.NaN,
    };
    const result = finalizePhaseTwoSubGroupLayout([
      node('domain', 'titleGroup', 'A', Number.NaN, Number.NaN),
    ], config);

    expect(Number.isFinite(result[0].position.x)).toBe(true);
    expect(Number.isFinite(result[0].position.y)).toBe(true);
  });
});
