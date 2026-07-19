// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  getEngineNodeLayout,
  isCytoscapeStrategy,
  isAvailableStrategyType,
  normalizeDiagramEdgeMode,
  normalizeElkAlgorithm,
  normalizeLayoutName,
  parseLayoutPresetValue,
} from '../diagramSettingsGuards';
import type { ILayoutStrategy } from '@/core/strategies/LayoutStrategyManager';

const strategy = (name: string): ILayoutStrategy => ({
  calculateLayout: (nodes, edges) => ({ nodes, edges }),
  getName: () => name,
  getDescription: () => name,
  isApplicable: () => true,
  getCategory: () => 'node',
});

describe('diagramSettingsGuards', () => {
  it('normalizes edge and layout values to bounded choices', () => {
    expect(normalizeDiagramEdgeMode('smart')).toBe('advanced-smart');
    expect(normalizeDiagramEdgeMode('advanced-smart')).toBe('advanced-smart');
    expect(normalizeDiagramEdgeMode('unexpected')).toBe('native');
    expect(normalizeElkAlgorithm('force')).toBe('force');
    expect(normalizeElkAlgorithm('unknown')).toBe('layered');
    expect(normalizeLayoutName('Domain Elk_Layout')).toBe('domainelklayout');
  });

  it('rejects malformed compound layout presets', () => {
    expect(parseLayoutPresetValue('strict+elk')).toEqual({ containment: 'strict', rank: 'elk' });
    expect(parseLayoutPresetValue('strict+shell')).toBeNull();
    expect(parseLayoutPresetValue('elastic+elk+extra')).toBeNull();
    expect(parseLayoutPresetValue('prototype+elk')).toBeNull();
  });

  it('maps known node strategies and detects cytoscape node strategies', () => {
    expect(getEngineNodeLayout('Vertical_Layout')).toBe('vertical');
    expect(getEngineNodeLayout('unknown')).toBeUndefined();
    expect(isCytoscapeStrategy(strategy('CytoscapeFcoseLayout'))).toBe(true);
    expect(isCytoscapeStrategy(strategy('HorizontalLayout'))).toBe(false);
  });

  it('allows only published strategy types', () => {
    const strategies = [{ type: 'DomainVerticalLayout' }, { type: 'GridLayout' }];
    expect(isAvailableStrategyType('GridLayout', strategies)).toBe(true);
    expect(isAvailableStrategyType('UnknownLayout', strategies)).toBe(false);
    expect(isAvailableStrategyType(42, strategies)).toBe(false);
  });
});
