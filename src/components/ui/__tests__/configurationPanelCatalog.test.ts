// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createConfigurationItemsByCategory } from '../configurationPanelCatalog';

const flattenAdvancedItems = (catalog: ReturnType<typeof createConfigurationItemsByCategory>) => [
  ...catalog.nodes,
  ...catalog.containers,
  ...catalog.spacing,
  ...catalog.edges,
  ...catalog.layout,
  ...catalog.performance,
];

describe('createConfigurationItemsByCategory', () => {
  it('builds a unique advanced catalog and a basic subset', () => {
    const catalog = createConfigurationItemsByCategory(
      ['DomainVerticalLayout', 'DomainHorizontalLayout'],
      ['VerticalLayout', 'DagreLayout'],
    );
    const advancedItems = flattenAdvancedItems(catalog);
    const advancedKeys = advancedItems.map(item => item.key);

    expect(Object.keys(catalog)).toEqual([
      'basic',
      'nodes',
      'containers',
      'spacing',
      'edges',
      'layout',
      'performance',
    ]);
    expect(new Set(advancedKeys).size).toBe(advancedKeys.length);
    expect(catalog.basic.every(item => advancedKeys.includes(item.key))).toBe(true);
    expect(catalog.basic.every(item => item.group === undefined)).toBe(true);
  });

  it('normalizes malformed dynamic strategy options and preserves defaults', () => {
    const catalog = createConfigurationItemsByCategory(
      ['', ' DomainHorizontalLayout ', 'DomainHorizontalLayout', null, 42],
      ['DagreLayout', 'DagreLayout', {}, ''],
    );
    const hierarchy = catalog.layout.find(item => item.key === 'diagram.layout.strategy');
    const nodes = catalog.layout.find(item => item.key === 'diagram.layout.nodeStrategy');

    expect(hierarchy?.options).toEqual(['DomainVerticalLayout', 'DomainHorizontalLayout']);
    expect(nodes?.options).toEqual(['VerticalLayout', 'DagreLayout']);
    expect(hierarchy?.options).toContain(hierarchy?.value);
    expect(nodes?.options).toContain(nodes?.value);
  });

  it('keeps numeric and select metadata internally valid', () => {
    const catalog = createConfigurationItemsByCategory([], []);

    for (const item of flattenAdvancedItems(catalog)) {
      if (item.type === 'number') {
        expect(Number.isFinite(item.value)).toBe(true);
        if (item.min !== undefined) expect(item.value).toBeGreaterThanOrEqual(item.min);
        if (item.max !== undefined) expect(item.value).toBeLessThanOrEqual(item.max);
      }
      if (item.type === 'select') {
        expect(item.options).toContain(String(item.value));
      }
    }
  });

  it('bounds oversized dynamic option lists', () => {
    const hierarchyOptions = [
      'x'.repeat(500),
      ...Array.from({ length: 500 }, (_, index) => `layout-${index}`),
    ];
    const catalog = createConfigurationItemsByCategory(hierarchyOptions, hierarchyOptions);
    const dynamicSelects = catalog.layout.filter(item => (
      item.key === 'diagram.layout.strategy' || item.key === 'diagram.layout.nodeStrategy'
    ));

    expect(dynamicSelects).toHaveLength(2);
    expect(dynamicSelects.every(item => (item.options?.length ?? 0) <= 100)).toBe(true);
    expect(dynamicSelects.every(item => item.options?.every(option => option.length <= 100))).toBe(true);
  });
});
