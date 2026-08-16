import { describe, expect, it, vi } from 'vitest';

import {
  buildFlowchartLayoutMenuModel,
  resolveActiveDomainLayoutKey,
  resolveNodeLayoutHostStrategy,
} from '../flowchartToolbarLayoutMenu';

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const collectItems = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    const record = asRecord(item);
    result.push(record);
    result.push(...collectItems(record.children));
  }
  return result;
};

describe('flowchartToolbarLayoutMenu', () => {
  it('exposes ELK layered layouts in both supported directions', () => {
    const onStrategyLayout = vi.fn();
    const model = buildFlowchartLayoutMenuModel({
      lastDomainStrategy: 'domain-elk',
      lastDomainDirection: 'LR',
      lastNodeLayout: 'elk',
      onStrategyLayout,
      translate: (_key, fallback) => fallback,
    });
    const items = collectItems(model.items);
    const elkTb = items.find(item => item.key === 'domain-elk-tb');
    const elkLr = items.find(item => item.key === 'domain-elk-lr');
    const legacyDagreLr = items.find(item => item.key === 'domain-dagre-lr');

    expect(elkTb).toBeDefined();
    expect(elkLr).toBeDefined();
    expect(legacyDagreLr).toBeUndefined();
    expect(model.selectedKeys).toContain('domain-elk-lr');
    expect(resolveActiveDomainLayoutKey('domain-elk', 'TB')).toBe('domain-elk-tb');

    const click = elkLr?.onClick;
    expect(typeof click).toBe('function');
    if (typeof click === 'function') click();
    expect(onStrategyLayout).toHaveBeenCalledWith('domain-elk', 'elk-layered', 'LR');
  });

  it('routes node-layout choices to an engine that implements them', () => {
    const onStrategyLayout = vi.fn();
    const forceModel = buildFlowchartLayoutMenuModel({
      lastDomainStrategy: 'force',
      lastDomainDirection: 'TB',
      lastNodeLayout: 'dagre',
      onStrategyLayout,
      translate: (_key, fallback) => fallback,
    });
    const flowItem = collectItems(forceModel.items).find(item => item.key === 'node-flow');
    expect(typeof flowItem?.onClick).toBe('function');
    if (typeof flowItem?.onClick === 'function') flowItem.onClick();
    expect(onStrategyLayout).toHaveBeenCalledWith('domain-vertical', 'flow', 'TB');

    expect(resolveNodeLayoutHostStrategy('tree', 'TB')).toBe('domain-vertical');
    expect(resolveNodeLayoutHostStrategy('domain-elk', 'LR')).toBe('domain-horizontal');
    expect(resolveNodeLayoutHostStrategy('domain-horizontal', 'TB')).toBe('domain-horizontal');
  });
});
