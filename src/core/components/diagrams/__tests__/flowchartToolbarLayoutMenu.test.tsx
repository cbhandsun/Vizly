import { describe, expect, it, vi } from 'vitest';

import {
  buildFlowchartLayoutMenuModel,
  resolveActiveDomainLayoutKey,
  resolveNodeLayoutHostStrategy,
} from '../flowchartToolbarLayoutMenu';
import {
  coerceFlowchartDomainNodeArrangement,
  createCustomDomainLayoutCommand,
  isGlobalFullGraphLayoutStrategy,
  resolveCustomDomainLayoutDirection,
  resolveDomainLayoutRoutingQuality,
  resolveLayoutDomainOrder,
  shouldPromoteDomainDagreRouteCandidate,
  usesSelectableDomainNodeArrangement,
} from '../flowchartLayoutStrategyMode';
import { resolveFlowchartCustomDomainLayoutCapability } from '../flowchartLayoutCapabilities';

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
    expect(resolveDomainLayoutRoutingQuality('domain-lanes')).toBe('interactive');
    expect(resolveDomainLayoutRoutingQuality('domain-dagre')).toBeUndefined();
    expect(shouldPromoteDomainDagreRouteCandidate('domain-lanes')).toBe(false);
    expect(shouldPromoteDomainDagreRouteCandidate('domain-dagre')).toBe(true);
    expect(createCustomDomainLayoutCommand('TB', 'grid')).toEqual({
      direction: 'TB',
      nodeLayout: 'grid',
      strategyName: 'domain-vertical',
    });
    expect(createCustomDomainLayoutCommand('LR', 'invalid')).toEqual({
      direction: 'LR',
      nodeLayout: 'dagre',
      strategyName: 'domain-horizontal',
    });
    expect(coerceFlowchartDomainNodeArrangement(undefined)).toBe('dagre');
    expect(resolveCustomDomainLayoutDirection('domain-horizontal', 'TB')).toBe('LR');
  });

  it('exposes custom domain composition only for simple directed forests', () => {
    const treeNodes = [
      { id: 'domain-a', type: 'titleGroup', position: { x: 0, y: 0 }, data: {} },
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 0, y: 0 }, data: {} },
      { id: 'c', position: { x: 0, y: 0 }, data: {} },
    ];
    expect(resolveFlowchartCustomDomainLayoutCapability(treeNodes, [
      { id: 'a-b', source: 'a', target: 'b' },
      { id: 'a-c', source: 'a', target: 'c' },
    ])).toEqual({ available: true, reason: 'available' });
    expect(resolveFlowchartCustomDomainLayoutCapability(treeNodes, [
      { id: 'a-c', source: 'a', target: 'c' },
      { id: 'b-c', source: 'b', target: 'c' },
    ])).toEqual({ available: false, reason: 'complex-topology' });
    expect(resolveFlowchartCustomDomainLayoutCapability([], []))
      .toEqual({ available: false, reason: 'empty' });
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
    const globalGroup = items.find(item => item.key === 'group-tree');
    const domainGroup = items.find(item => item.key === 'group-domain');
    const legacyDagreLr = items.find(item => item.key === 'domain-dagre-lr');

    expect(elkTb).toBeDefined();
    expect(elkLr).toBeDefined();
    expect(collectItems(globalGroup?.children).map(item => item.key)).toEqual([
      'tree-tb',
      'tree-lr',
      'force',
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

  it('presents domain direction and internal node arrangement as one custom combination', () => {
    const onStrategyLayout = vi.fn();
    const model = buildFlowchartLayoutMenuModel({
      lastDomainStrategy: 'domain-horizontal',
      lastDomainDirection: 'LR',
      lastNodeLayout: 'grid',
      onStrategyLayout,
      translate: (_key, fallback) => fallback,
    });
    const items = collectItems(model.items);
    const directionTb = items.find(item => item.key === 'custom-domain-tb');
    const nodeVertical = items.find(item => item.key === 'node-vertical');

    expect(model.selectedKeys).toEqual(['custom-domain-lr', 'node-grid']);
    expect(model.statusText).toBe('自定义组合：域横向排列（左→右） + 网格排列');
    expect(resolveActiveDomainLayoutKey('domain-vertical', 'TB')).toBe('custom-domain-tb');

    if (typeof directionTb?.onClick === 'function') directionTb.onClick();
    expect(onStrategyLayout).toHaveBeenCalledWith('domain-vertical', 'grid', 'TB');

    if (typeof nodeVertical?.onClick === 'function') nodeVertical.onClick();
    expect(onStrategyLayout).toHaveBeenLastCalledWith('domain-horizontal', 'vertical', 'LR');
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
    expect(model.statusText).toBe('复杂流程（保留域·左→右）');
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
    expect(model.statusText).toBe('循环流程泳道（左→右）');
    if (typeof lanesLr?.onClick === 'function') lanesLr.onClick();
    expect(onStrategyLayout).toHaveBeenCalledWith('domain-lanes', undefined, 'LR');
  });

  it('keeps common scenarios visible and separates custom combinations from layout engines', () => {
    const onSmartLayout = vi.fn();
    const model = buildFlowchartLayoutMenuModel({
      lastDomainStrategy: 'domain-dagre',
      lastDomainDirection: 'TB',
      lastNodeLayout: 'dagre',
      onSmartLayout,
      onStrategyLayout: vi.fn(),
      translate: (_key, fallback) => fallback,
    });
    const recommended = asRecord(model.items[0]);
    const customCombination = asRecord(model.items[2]);
    const moreEngines = asRecord(model.items[4]);

    expect(recommended.key).toBe('group-recommended');
    expect(collectItems(recommended.children).map(item => item.key)).toEqual([
      'smart-recommendation',
      'domain-dagre-tb',
      'domain-compound-elk-lr',
      'domain-lanes-lr',
    ]);
    expect(customCombination.key).toBe('group-custom-combination');
    expect(collectItems(customCombination.children).map(item => item.key)).toEqual([
      'custom-domain-direction',
      'custom-domain-tb',
      'custom-domain-lr',
      'custom-node-arrangement',
      'node-dagre',
      'node-flow',
      'node-grid',
      'node-horizontal',
      'node-vertical',
    ]);
    expect(moreEngines.key).toBe('more-layout-engines');
    expect(collectItems(moreEngines.children).map(item => item.key)).toContain('domain-elk-lr');

    const smart = collectItems(recommended.children)
      .find(item => item.key === 'smart-recommendation');
    expect(typeof smart?.onClick).toBe('function');
    if (typeof smart?.onClick === 'function') smart.onClick();
    expect(onSmartLayout).toHaveBeenCalledOnce();
  });

  it('disables only custom composition controls for graphs that require a preset engine', () => {
    const model = buildFlowchartLayoutMenuModel({
      customDomainLayoutAvailable: false,
      lastDomainStrategy: 'domain-compound-elk',
      lastDomainDirection: 'LR',
      onStrategyLayout: vi.fn(),
      translate: (_key, fallback) => fallback,
    });
    const items = collectItems(model.items);

    expect(items.find(item => item.key === 'custom-domain-direction')?.disabled).toBe(true);
    expect(items.find(item => item.key === 'custom-node-arrangement')?.disabled).toBe(true);
    expect(items.find(item => item.key === 'domain-compound-elk-lr')?.disabled).not.toBe(true);
    expect(asRecord(model.items[2]).label).toContain('当前图含合流或循环');
  });
});
