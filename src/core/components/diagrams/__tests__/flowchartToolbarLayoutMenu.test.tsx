import { describe, expect, it, vi } from 'vitest';

import {
  buildFlowchartLayoutMenuModel,
  resolveActiveDomainLayoutKey,
  resolveNodeLayoutHostStrategy,
} from '../flowchartToolbarLayoutMenu';
import {
  isGlobalFullGraphLayoutStrategy,
  resolveLayoutDomainOrder,
  usesSelectableDomainNodeArrangement,
} from '../flowchartLayoutStrategyMode';

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
  it('distinguishes global strategies from composable domain layouts', () => {
    expect(isGlobalFullGraphLayoutStrategy('tree')).toBe(true);
    expect(isGlobalFullGraphLayoutStrategy('force')).toBe(true);
    expect(isGlobalFullGraphLayoutStrategy('domain-elk')).toBe(true);
    expect(isGlobalFullGraphLayoutStrategy('domain-dagre')).toBe(false);
    expect(usesSelectableDomainNodeArrangement('domain-vertical')).toBe(true);
    expect(usesSelectableDomainNodeArrangement('domain-horizontal')).toBe(true);
    expect(usesSelectableDomainNodeArrangement('domain-dagre')).toBe(false);
    expect(usesSelectableDomainNodeArrangement('domain-dagre-sub-horizontal')).toBe(false);
    expect(usesSelectableDomainNodeArrangement('domain-compound-elk')).toBe(false);
    expect(resolveLayoutDomainOrder('domain-lanes', undefined, ['scan-a', 'scan-b']))
      .toBeUndefined();
    expect(resolveLayoutDomainOrder('domain-lanes', ['explicit-b', 'explicit-a'], ['scan-a', 'scan-b']))
      .toEqual(['explicit-b', 'explicit-a']);
    expect(resolveLayoutDomainOrder('domain-dagre', undefined, ['scan-a', 'scan-b']))
      .toEqual(['scan-a', 'scan-b']);
  });

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
    const globalElkGroup = items.find(item => item.key === 'group-global-elk');
    const domainGroup = items.find(item => item.key === 'group-domain');
    const legacyDagreLr = items.find(item => item.key === 'domain-dagre-lr');

    expect(elkTb).toBeDefined();
    expect(elkLr).toBeDefined();
    expect(collectItems(globalElkGroup?.children).map(item => item.key)).toEqual([
      'domain-elk-tb',
      'domain-elk-lr',
    ]);
    expect(collectItems(domainGroup?.children).map(item => item.key)).not.toContain('domain-elk-tb');
    expect(legacyDagreLr).toBeUndefined();
    expect(model.selectedKeys).toContain('domain-elk-lr');
    expect(model.selectedKeys).not.toContain('node-elk');
    expect(model.statusText).not.toContain(' + ');
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
    expect(forceModel.selectedKeys).toEqual(['force']);
    expect(forceModel.statusText).not.toContain('Dagre');
    expect(typeof flowItem?.onClick).toBe('function');
    if (typeof flowItem?.onClick === 'function') flowItem.onClick();
    expect(onStrategyLayout).toHaveBeenCalledWith('domain-vertical', 'flow', 'TB');

    expect(resolveNodeLayoutHostStrategy('tree', 'TB')).toBe('domain-vertical');
    expect(resolveNodeLayoutHostStrategy('domain-elk', 'LR')).toBe('domain-horizontal');
    expect(resolveNodeLayoutHostStrategy('domain-horizontal', 'TB')).toBe('domain-horizontal');

    const dagreModel = buildFlowchartLayoutMenuModel({
      lastDomainStrategy: 'domain-dagre',
      lastDomainDirection: 'TB',
      lastNodeLayout: 'dagre',
      onStrategyLayout,
      translate: (_key, fallback) => fallback,
    });
    const dagreFlowItem = collectItems(dagreModel.items).find(item => item.key === 'node-flow');
    expect(dagreModel.selectedKeys).toEqual(['domain-dagre-tb']);
    expect(dagreModel.statusText).not.toContain(' + ');
    if (typeof dagreFlowItem?.onClick === 'function') dagreFlowItem.onClick();
    expect(onStrategyLayout).toHaveBeenLastCalledWith('domain-vertical', 'flow', 'TB');
  });

  it('exposes compound ELK as a domain-preserving layered mode', () => {
    const onStrategyLayout = vi.fn();
    const model = buildFlowchartLayoutMenuModel({
      lastDomainStrategy: 'domain-compound-elk',
      lastDomainDirection: 'LR',
      lastNodeLayout: 'dagre',
      onStrategyLayout,
      translate: (_key, fallback) => fallback,
    });
    const items = collectItems(model.items);
    const compoundLr = items.find(item => item.key === 'domain-compound-elk-lr');

    expect(compoundLr).toBeDefined();
    expect(model.selectedKeys).toEqual(['domain-compound-elk-lr']);
    expect(model.statusText).toBe('Domain ELK 组合 (左→右)');
    if (typeof compoundLr?.onClick === 'function') compoundLr.onClick();
    expect(onStrategyLayout).toHaveBeenCalledWith('domain-compound-elk', undefined, 'LR');
  });

  it('exposes ordered domain lanes without claiming a selectable node arrangement', () => {
    const onStrategyLayout = vi.fn();
    const model = buildFlowchartLayoutMenuModel({
      lastDomainStrategy: 'domain-lanes',
      lastDomainDirection: 'LR',
      lastNodeLayout: 'flow',
      onStrategyLayout,
      translate: (_key, fallback) => fallback,
    });
    const items = collectItems(model.items);
    const lanesLr = items.find(item => item.key === 'domain-lanes-lr');

    expect(lanesLr).toBeDefined();
    expect(model.selectedKeys).toEqual(['domain-lanes-lr']);
    expect(model.statusText).toBe('域泳道 + Dagre (左→右)');
    if (typeof lanesLr?.onClick === 'function') lanesLr.onClick();
    expect(onStrategyLayout).toHaveBeenCalledWith('domain-lanes', undefined, 'LR');
  });
});
