import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ELK_LAYERED_QUALITY_OPTIONS,
  resolveDomainElkEdgeRouting,
  resolveDomainElkSpacing,
  resolveDomainElkThoroughness,
} from '../domainElkLayoutProfile';
import { collectDomainElkLayoutRoutes } from '../domainElkLayoutRoutes';

describe('domainElkLayoutProfile', () => {
  it('uses official ELK layered quality option identifiers', () => {
    expect(DOMAIN_ELK_LAYERED_QUALITY_OPTIONS).toMatchObject({
      'elk.layered.considerModelOrder.strategy': 'NONE',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
    });
    expect(DOMAIN_ELK_LAYERED_QUALITY_OPTIONS).not.toHaveProperty(
      'elk.layered.considerModelOrder',
    );
  });

  it('gives the explicit commercial layout profile precedence', () => {
    expect(resolveDomainElkSpacing(120, 36)).toBe(120);
    expect(resolveDomainElkEdgeRouting('ORTHOGONAL', 'POLYLINE')).toBe('ORTHOGONAL');
  });

  it.each([
    [undefined, undefined, 120],
    [Number.NaN, -1, 120],
    [0, Number.POSITIVE_INFINITY, 120],
    [1, undefined, 24],
    [10_000, undefined, 2_000],
  ])('bounds invalid or extreme spacing (%s, %s)', (explicit, configured, expected) => {
    expect(resolveDomainElkSpacing(explicit, configured)).toBe(expected);
  });

  it.each([[80, '12'], [81, '8'], [250, '8'], [251, '5']])(
    'scales interactive thoroughness at %s nodes',
    (nodeCount, expected) => expect(resolveDomainElkThoroughness(nodeCount)).toBe(expected),
  );

  it.each([
    ['', '', 'ORTHOGONAL'],
    ['diagonal', 'invalid', 'ORTHOGONAL'],
    [undefined, 'polyline', 'POLYLINE'],
    [null, 'splines', 'SPLINES'],
  ])('validates routing style (%s, %s)', (explicit, configured, expected) => {
    expect(resolveDomainElkEdgeRouting(explicit, configured)).toBe(expected);
  });

  it('extracts only finite single-section orthogonal ELK candidates', () => {
    const routes = collectDomainElkLayoutRoutes([
      {
        id: 'usable',
        sources: ['a'],
        targets: ['b'],
        sections: [{
          id: 'usable-section',
          startPoint: { x: 100.4, y: 40.2 },
          bendPoints: [{ x: 180.2, y: 40.2 }, { x: 180.2, y: 240.4 }],
          endPoint: { x: 260.1, y: 240.4 },
        }],
      },
      {
        id: 'diagonal',
        sources: ['a'],
        targets: ['b'],
        sections: [{
          id: 'diagonal-section',
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 10, y: 10 },
        }],
      },
      {
        id: 'hyperedge',
        sources: ['a'],
        targets: ['b'],
        sections: [
          { id: 'one', startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } },
          { id: 'two', startPoint: { x: 10, y: 0 }, endPoint: { x: 20, y: 0 } },
        ],
      },
    ], { x: 40, y: 20 });

    expect(routes.get('usable')).toEqual([
      { x: 140, y: 60 },
      { x: 220, y: 60 },
      { x: 220, y: 260 },
      { x: 300, y: 260 },
    ]);
    expect(routes.has('diagonal')).toBe(false);
    expect(routes.has('hyperedge')).toBe(false);
  });

});
