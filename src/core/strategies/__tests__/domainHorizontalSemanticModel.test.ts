import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  applyDomainHorizontalGroupVisibility,
  injectSemanticSubGroupsForMissingKeys,
  normalizeDomainSemanticKey,
  rebindDomainHorizontalChildren,
} from '../domainHorizontalSemanticModel';

const node = (id: string, type: string, data: Record<string, unknown>): Node => ({
  id,
  type,
  data,
  position: { x: 0, y: 0 },
});

describe('domain horizontal semantic model', () => {
  it('applies group visibility without mutating input and propagates hidden state', () => {
    const input = [
      node('domain-a', 'titleGroup', { domain: 'A' }),
      node('sub-a', 'subGroup', { domain: 'A', subDomain: 'S', children: ['child'] }),
      node('child', 'task', { domain: 'A', subDomain: 'S' }),
    ];
    const result = applyDomainHorizontalGroupVisibility(input, {
      domainWhitelist: ['A'],
      subDomainWhitelist: [],
      showDomainGroups: true,
      showSubDomainGroups: true,
    });

    expect(result.find(item => item.id === 'domain-a')?.data).toMatchObject({ hidden: false, anchorLocked: true });
    expect(result.find(item => item.id === 'sub-a')?.data.hidden).toBe(true);
    expect(result.find(item => item.id === 'child')?.data.hidden).toBe(true);
    expect(input.find(item => item.id === 'child')?.data.hidden).toBeUndefined();
  });

  it('injects one deterministic subgroup per missing normalized semantic key', () => {
    const input = [
      node('collision', 'task', { domain: '物流', subDomain: '预约 管理' }),
      node('subGroup__物流__预约管理', 'task', { domain: 'other' }),
    ];
    const result = injectSemanticSubGroupsForMissingKeys(input);
    const generated = result.find(item => item.type === 'subGroup');

    expect(generated?.id).toBe('subGroup__物流__预约管理__2');
    expect(generated?.data).toMatchObject({ domain: '物流', subDomain: '预约管理', children: [] });
    expect(generated?.draggable).toBe(false);
  });

  it('rebinds children across punctuation variants within the same domain only', () => {
    const result = rebindDomainHorizontalChildren([
      node('sub-a', 'subGroup', { domain: 'A', subDomain: '预约（管理）', children: ['stale'] }),
      node('sub-duplicate', 'subGroup', { domain: 'A', subDomain: '预约管理', children: [] }),
      node('a', 'task', { domain: 'A', subDomain: '预约管理' }),
      node('b', 'task', { domain: 'B', subDomain: '预约管理' }),
    ]);

    expect(result.find(item => item.id === 'sub-a')?.data.children).toEqual(['a']);
    expect(result.some(item => item.id === 'sub-duplicate')).toBe(false);
    expect(normalizeDomainSemanticKey(' 预约（管理） ', true)).toBe('预约管理');
  });

  it('ignores malformed metadata and children values safely', () => {
    const input = [
      node('sub', 'subGroup', { domain: 'A', subDomain: 'S', children: 'child' }),
      node('child', 'task', { domain: 'A', metadata: 'bad' }),
    ];
    expect(() => rebindDomainHorizontalChildren(input)).not.toThrow();
    expect(() => applyDomainHorizontalGroupVisibility(input, {
      showDomainGroups: true,
      showSubDomainGroups: false,
    })).not.toThrow();
  });
});
