import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  injectSemanticSubGroupsForMissingKeys,
  rebindChildrenNormalized,
} from '../semanticHelpers';

const node = (id: string, type: string, data: Record<string, unknown>): Node => ({
  id,
  type,
  data,
  position: { x: 0, y: 0 },
});

describe('semanticHelpers', () => {
  it('injects missing semantic subgroups without mutating source data', () => {
    const source = node('child', 'task', { domain: 'A', metadata: { subDomain: 'Queue Ops' } });
    const result = injectSemanticSubGroupsForMissingKeys([source]);

    expect(result.find(item => item.type === 'subGroup')).toMatchObject({
      id: 'subGroup__a__queueops',
      data: { domain: 'A', subDomain: 'queueops', children: [] },
    });
    expect(result[0]).not.toBe(source);
    expect(result[0].data).not.toBe(source.data);
  });

  it('rebinds punctuation variants and isolates domains', () => {
    const result = rebindChildrenNormalized([
      node('sub-a', 'subGroup', { domain: 'A', subDomain: '预约（管理）', children: ['stale'] }),
      node('a', 'task', { domain: 'A', subDomain: '预约管理' }),
      node('b', 'task', { domain: 'B', subDomain: '预约管理' }),
    ]);

    expect(result.find(item => item.id === 'sub-a')?.data.children).toEqual(['a']);
  });

  it('handles prototype-like semantic keys and malformed metadata safely', () => {
    const input = [
      node('sub', 'subGroup', { domain: 'A', subDomain: 'constructor' }),
      node('constructor-child', 'task', { domain: 'A', subDomain: 'constructor' }),
      node('malformed', 'task', { domain: 'A', metadata: 'invalid' }),
    ];

    expect(() => rebindChildrenNormalized(input)).not.toThrow();
    expect(rebindChildrenNormalized(input).find(item => item.id === 'sub')?.data.children)
      .toEqual(['constructor-child']);
  });
});
