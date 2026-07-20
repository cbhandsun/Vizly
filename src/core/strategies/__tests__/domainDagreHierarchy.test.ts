import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildDomainDagreMembership,
  convertDomainDagreToHierarchy,
  sortDomainDagreHierarchy,
  sortDomainDagreSubGroups,
} from '../domainDagreHierarchy';

const node = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  position = { x: 0, y: 0 },
): Node => ({ id, type, data, position });

describe('domain Dagre hierarchy model', () => {
  it('builds bounded subgroup membership from valid current nodes', () => {
    const child = node('child', 'default', { domain: 'A' });
    const group = node('group', 'subGroup', { children: ['child', 'missing', 'child'] });
    const membership = buildDomainDagreMembership([child, group], [group]);

    expect(membership.childrenBySubGroup.get('group')).toEqual(['child']);
    expect(membership.nodeToSubGroup.get('child')).toBe('group');
  });

  it('converts absolute positions to current parent-relative coordinates without mutation', () => {
    const domain = node('domain', 'titleGroup', { domain: 'A' }, { x: 100, y: 50 });
    const group = node('group', 'subGroup', { domain: 'A' }, { x: 140, y: 100 });
    const child = {
      ...node('child', 'default', { domain: 'A' }, { x: 180, y: 150 }),
      positionAbsolute: { x: 190, y: 170 },
    } as Node;
    const result = convertDomainDagreToHierarchy(
      [child, group, domain],
      new Map([['child', 'group']]),
    );

    expect(result.find(item => item.id === 'group')).toMatchObject({
      parentId: 'domain', position: { x: 40, y: 50 }, extent: 'parent',
    });
    expect(result.find(item => item.id === 'child')).toMatchObject({
      parentId: 'group', position: { x: 50, y: 70 }, extent: 'parent',
    });
    expect('positionAbsolute' in result.find(item => item.id === 'child')!).toBe(false);
    expect(child.position).toEqual({ x: 180, y: 150 });
  });

  it('does not attach nodes to hidden domains and orders parents before children', () => {
    const domain = node('domain', 'titleGroup', { domain: 'A', hidden: true });
    const child = node('child', 'default', { domain: 'A' });
    const result = convertDomainDagreToHierarchy([child, domain], new Map());

    expect(result.find(item => item.id === 'child')?.parentId).toBeUndefined();
    expect(sortDomainDagreHierarchy([child, domain]).map(item => item.id)).toEqual(['domain', 'child']);
  });

  it('sorts subgroups by normalized configured order', () => {
    const first = node('first', 'subGroup', { subDomain: 'First_Sub' });
    const second = node('second', 'subGroup', { subDomain: 'Second' });
    expect(sortDomainDagreSubGroups([second, first], 'Domain A', {
      domaina: ['first sub', 'second'],
    }).map(item => item.id)).toEqual(['first', 'second']);
  });
});
