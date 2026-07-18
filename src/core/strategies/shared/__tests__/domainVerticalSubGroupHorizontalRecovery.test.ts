import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  clampSubGroupsToDomainHorizontalInsets,
  separateSubGroupsAndExpandDomainsIteratively,
} from '../domainVerticalSubGroupHorizontalRecovery';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  width: number,
  children?: string[],
): ReactFlowNode => ({
  id,
  type,
  position: { x, y: 20 },
  measured: { width, height: 100 },
  style: { width, height: 100 },
  width,
  height: 100,
  data: { domain, children },
});

describe('domainVerticalSubGroupHorizontalRecovery', () => {
  it('reacquires current containers after iterative graph replacement', () => {
    const separate = vi.fn((nodes: ReactFlowNode[]) => ({
      nodes: nodes.map(item => item.id === 'sub'
        ? { ...item, position: { ...item.position, x: 250 } }
        : { ...item }),
      movedDomainKeys: [],
    }));
    const input = [
      node('domain', 'titleGroup', 'A', 100, 300),
      node('sub', 'subGroup', 'A', 120, 200),
    ];
    const result = separateSubGroupsAndExpandDomainsIteratively(input, {
      layout: 'horizontal',
      domainHorizontalPadding: 20,
      subGroupHorizontalPadding: 10,
      horizontalGap: 30,
      iterations: 5,
      safeEdge: 12,
      defaultSubGroupWidth: 200,
      defaultContainerHeight: 80,
      ensureMeasured: nodes => nodes.map(item => ({ ...item })),
      finalizeSubGroupWidths: nodes => nodes.map(item => ({ ...item })),
      recomputeSubGroups: nodes => nodes.map(item => ({ ...item })),
      separate,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(separate).toHaveBeenCalledTimes(1);
    expect(byId.get('domain')?.measured?.width).toBe(409);
    expect(input[0].measured?.width).toBe(300);
  });

  it('stops iterative separation after convergence and sanitizes options', () => {
    const separate = vi.fn((nodes: ReactFlowNode[]) => ({
      nodes,
      movedDomainKeys: [],
    }));
    const result = separateSubGroupsAndExpandDomainsIteratively([
      node('domain', 'titleGroup', 'A', Number.NaN, 300),
    ], {
      layout: 'grid',
      domainHorizontalPadding: -1,
      subGroupHorizontalPadding: Number.NaN,
      horizontalGap: Number.POSITIVE_INFINITY,
      iterations: -2,
      safeEdge: -1,
      defaultSubGroupWidth: Number.NaN,
      defaultContainerHeight: Number.NaN,
      ensureMeasured: nodes => nodes,
      finalizeSubGroupWidths: nodes => nodes,
      recomputeSubGroups: nodes => nodes,
      separate,
    });

    expect(separate).toHaveBeenCalledTimes(1);
    expect(Number.isFinite(result[0].position.x)).toBe(true);
  });

  it('clamps subgroups and rigidly translates current declared children', () => {
    const input = [
      node('domain', 'titleGroup', 'A', 100, 500),
      node('sub', 'subGroup', ' A ', 80, 160, ['child', 'child', 'missing']),
      node('child', 'default', 'A', 95, 80),
    ];
    const result = clampSubGroupsToDomainHorizontalInsets(input, {
      layout: 'horizontal',
      domainHorizontalPadding: 20,
      subGroupHorizontalPadding: 10,
      horizontalGap: 40,
      defaultSubGroupWidth: 200,
      orderOf: () => 0,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('sub')?.position.x).toBe(124);
    expect(byId.get('child')?.position.x).toBe(139);
    expect(
      (byId.get('child')?.position.x ?? 0)
      - (byId.get('sub')?.position.x ?? 0),
    ).toBe(15);
    expect(input[1].position.x).toBe(80);
  });
});
