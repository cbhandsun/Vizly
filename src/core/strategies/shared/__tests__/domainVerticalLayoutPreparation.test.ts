import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { LayoutType } from '../../../types/layout';
import {
  applyDomainVerticalVisibility,
  collectDomainVerticalDomainOrder,
  collectOrderedDomainSubGroups,
  createDomainVerticalOrderKey,
  resolveDomainVerticalNodeLayout,
} from '../domainVerticalLayoutPreparation';

const node = (
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): ReactFlowNode => ({
  id,
  type,
  data,
  position: { x: 0, y: 0 },
});

describe('domainVerticalLayoutPreparation', () => {
  it('normalizes requested and configured layout names with a safe fallback', () => {
    expect(resolveDomainVerticalNodeLayout(LayoutType.GRID)).toBe('grid');
    expect(resolveDomainVerticalNodeLayout(' Vertical_Layout ')).toBe('vertical');
    expect(resolveDomainVerticalNodeLayout(undefined, 'dagre-layout')).toBe('dagre');
    expect(resolveDomainVerticalNodeLayout('unknown', 'centered')).toBe('centered');
    expect(resolveDomainVerticalNodeLayout(Number.NaN, { invalid: true })).toBe('horizontal');
  });

  it('clones nodes, applies whitelists, locks containers, and propagates hidden children', () => {
    const input = [
      node('domain-a', 'titleGroup', { domain: 'A' }),
      node('domain-b', 'domain', { domain: 'B' }),
      node('sub-a', 'subGroup', {
        domain: 'A',
        description: 'Visible',
        children: ['child-a'],
      }),
      node('sub-b', 'subGroup', {
        domain: 'A',
        description: 'Hidden',
        children: ['child-b'],
      }),
      node('child-a', 'default', { domain: 'A' }),
      node('child-b', 'default', { domain: 'A' }),
    ];

    const result = applyDomainVerticalVisibility(input, {
      domainWhitelist: ['A', 42],
      subDomainWhitelist: ['Visible', null],
      generateDomainGroups: true,
      generateSubDomainGroups: true,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-a')?.data).toMatchObject({
      hidden: false,
      anchorLocked: true,
    });
    expect(byId.get('domain-b')?.data).toMatchObject({ anchorLocked: true });
    expect(byId.get('sub-a')?.data).toMatchObject({ hidden: false });
    expect(byId.get('sub-b')?.data).toMatchObject({ hidden: true });
    expect(byId.get('child-a')?.data).not.toHaveProperty('hidden');
    expect(byId.get('child-b')?.data).toMatchObject({ hidden: true });
    expect(result[0]).not.toBe(input[0]);
    expect(result[0].data).not.toBe(input[0].data);
    expect(input[0].data).not.toHaveProperty('hidden');
  });

  it('coerces supported boolean inputs and rejects ambiguous values', () => {
    const result = applyDomainVerticalVisibility(
      [
        node('domain', 'titleGroup', { domain: 'A' }),
        node('sub', 'subGroup', { description: 'S', children: [] }),
      ],
      {
        domainWhitelist: 'A',
        subDomainWhitelist: { value: 'S' },
        generateDomainGroups: 'true',
        generateSubDomainGroups: 'false',
      },
    );

    expect(result[0].data).toMatchObject({ hidden: false, anchorLocked: true });
    expect(result[1].data).toMatchObject({ hidden: true });

    const ambiguous = applyDomainVerticalVisibility(
      [node('domain', 'titleGroup', { domain: 'A' })],
      { generateDomainGroups: 'yes' },
    );
    expect(ambiguous[0].data).toMatchObject({ hidden: true });
  });

  it('collects stable, trimmed, unique domain order and rejects non-string entries', () => {
    const nodes = [
      node('a', 'default', { domain: ' B ' }),
      node('b', 'default', { domain: 'A' }),
      node('c', 'default', { domain: 'B' }),
      node('d', 'default', { domain: 42 }),
    ];

    expect(collectDomainVerticalDomainOrder(nodes, undefined)).toEqual(['B', 'A']);
    expect(collectDomainVerticalDomainOrder(nodes, [' C ', '', 12, 'A', 'C'])).toEqual([
      'C',
      'A',
    ]);
  });

  it('orders subgroups by explicit semantic keys, then sequence and original children', () => {
    const childA = node('child-a', 'default', { domain: 'D', subDomain: 'Alpha' });
    const childB = node('child-b', 'default', { domain: 'D', subDomain: 'Beta' });
    const alpha = node('alpha', 'subGroup', {
      domain: 'D',
      description: 'Alpha',
      children: ['child-a'],
    });
    const beta = node('beta', 'subGroup', {
      domain: 'D',
      description: 'Beta_Group',
      children: ['child-b'],
    });
    const orderKey = createDomainVerticalOrderKey(
      [childA, childB, alpha, beta],
      { ' d ': ['beta group', 'alpha'] },
    );

    expect(orderKey(beta)).toBeLessThan(orderKey(alpha));

    const sequenceKey = createDomainVerticalOrderKey([childA, childB], undefined);
    expect(sequenceKey(node('late', 'default', { sequence: '2' }))).toBe(-99_998);
    expect(sequenceKey(node('invalid', 'default', { sequence: '2oops' }))).toBe(
      Number.POSITIVE_INFINITY,
    );

    const inferredKey = createDomainVerticalOrderKey(
      [childB, childA, alpha, beta],
      undefined,
    );
    expect(inferredKey(beta)).toBeLessThan(inferredKey(alpha));
  });

  it('collects only one domain subgroups with stable tie ordering', () => {
    const first = node('first', 'subGroup', { domain: ' A ', sequence: 2 });
    const tiedA = node('tied-a', 'subGroup', { domain: 'A' });
    const tiedB = node('tied-b', 'subGroup', { domain: 'A' });
    const foreign = node('foreign', 'subGroup', { domain: 'B', sequence: 1 });
    const business = node('business', 'default', { domain: 'A' });
    const orderKey = createDomainVerticalOrderKey(
      [tiedA, tiedB, first, foreign, business],
      undefined,
    );

    expect(collectOrderedDomainSubGroups(
      [tiedA, tiedB, first, foreign, business],
      ' A ',
      orderKey,
    ).map(item => item.id)).toEqual(['first', 'tied-a', 'tied-b']);
    expect(collectOrderedDomainSubGroups([], '', orderKey)).toEqual([]);
  });

  it('handles empty inputs and missing subgroup membership without throwing', () => {
    const orderKey = createDomainVerticalOrderKey([], {
      Domain: Object.freeze([]),
    });

    expect(collectDomainVerticalDomainOrder([], [])).toEqual([]);
    expect(orderKey(node('missing', 'subGroup', {
      domain: 'Domain',
      children: [null, {}, 'unknown'],
    }))).toBe(Number.POSITIVE_INFINITY);
  });

  it('falls back safely when a hostile order object cannot be enumerated', () => {
    const hostileOrder = new Proxy({}, {
      ownKeys() {
        throw new Error('blocked');
      },
    });
    const orderKey = createDomainVerticalOrderKey(
      [node('child', 'default', { domain: 'D', subDomain: 'S' })],
      hostileOrder as Record<string, readonly string[]>,
    );

    expect(() => orderKey(node('sub', 'subGroup', {
      domain: 'D',
      description: 'S',
      children: ['child'],
    }))).not.toThrow();
  });
});
