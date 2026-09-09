// @vitest-environment node
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  collapseGeneratedDomainAliasSubGroups,
  isDomainAliasSubDomain,
  normalizeDomainSemanticKey,
} from '../domainSemanticKey';

const node = (id: string, data: Record<string, unknown>, overrides: Partial<Node> = {}): Node => ({
  id,
  type: 'subGroup',
  position: { x: 0, y: 0 },
  data,
  ...overrides,
});

describe('domainSemanticKey', () => {
  it('matches bounded case, whitespace and punctuation variants', () => {
    expect(isDomainAliasSubDomain(' 决策 与协同 ', '决策（与协同）')).toBe(true);
    expect(normalizeDomainSemanticKey('A_B+C')).toBe('abc');
    expect(isDomainAliasSubDomain('A', 'B')).toBe(false);
  });

  it.each([null, undefined, 1, {}, [], '', ' '.repeat(300)])('rejects empty or non-text aliases: %j', value => {
    expect(isDomainAliasSubDomain(value, value)).toBe(false);
  });

  it('removes marked and legacy generated aliases and detaches their children', () => {
    const opsDomain = node('domain-ops', { domain: 'Ops' }, { type: 'titleGroup' });
    const logisticsDomain = node('domain-logistics', { domain: '物流' }, { type: 'titleGroup' });
    const marked = node('generated', { domain: 'Ops', subDomain: 'ops', layoutGenerated: 'subdomain' }, { draggable: false });
    const legacy = node('subgroup-物流-物流', { domain: '物流', subDomain: '物流' }, { draggable: false });
    const child = node('child', {}, { type: 'task', parentId: marked.id, extent: 'parent', expandParent: true });
    const result = collapseGeneratedDomainAliasSubGroups([opsDomain, logisticsDomain, marked, legacy, child]);

    expect(result.map(item => item.id)).toEqual(['domain-ops', 'domain-logistics', 'child']);
    expect(result[2]).not.toHaveProperty('parentId');
    expect(result[2]).not.toHaveProperty('extent');
    expect(result[2]).not.toHaveProperty('expandParent');
  });

  it('preserves authored, draggable and semantically distinct subgroups', () => {
    const domain = node('domain', { domain: 'Ops' }, { type: 'titleGroup' });
    const authored = node('authored', { domain: 'Ops', subDomain: 'Ops' }, { draggable: false });
    const draggable = node('subgroup-Ops-Ops', { domain: 'Ops', subDomain: 'Ops' }, { draggable: true });
    const distinct = node('subgroup-Ops-Returns', { domain: 'Ops', subDomain: 'Returns' }, { draggable: false });
    const input = [domain, authored, draggable, distinct];

    expect(collapseGeneratedDomainAliasSubGroups(input)).toEqual(input);
  });

  it('keeps the only visible grouping when its domain container is hidden', () => {
    const domain = node('domain', { domain: 'Ops', hidden: true }, { type: 'titleGroup', hidden: true });
    const subgroup = node('subgroup-Ops-Ops', { domain: 'Ops', subDomain: 'Ops' }, { draggable: false });
    expect(collapseGeneratedDomainAliasSubGroups([domain, subgroup])).toEqual([domain, subgroup]);
  });

  it('bounds long untrusted values without throwing', () => {
    const prefix = 'x'.repeat(200);
    expect(isDomainAliasSubDomain(`${prefix}left`, `${prefix}right`)).toBe(false);
    expect(() => collapseGeneratedDomainAliasSubGroups([
      node('unsafe', { domain: { toString: () => { throw new Error('unsafe'); } }, subDomain: 'x' }, { draggable: false }),
    ])).not.toThrow();
  });
});
