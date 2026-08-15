import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  loadLayoutStrategyPresetFromCandidates,
  normalizeLayoutVisibilityNodes,
  resolveLayoutStrategyGeneratedGroupOptions,
  resolveLayoutStrategyPresetFromCandidates,
  sanitizeLayoutEdges,
  stripHiddenGeneratedLayoutNodes,
} from '../useLayoutStrategy';

describe('sanitizeLayoutEdges', () => {
  it('preserves layout path trust metadata from the routing strategy', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 0, y: 120 }, data: {} },
    ] as Node[];
    const edges = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        sourceHandle: 'b',
        targetHandle: 't',
        data: {
          computedPath: [{ x: 50, y: 40 }, { x: 50, y: 120 }],
          layoutPathLocked: true,
          _layoutPathLocked: true,
          sharedTrunkAware: true,
          stablePathQuality: { strictCrossings: 0 },
          _layoutEpoch: 123,
        },
      },
    ] as Edge[];

    const [edge] = sanitizeLayoutEdges(nodes, edges, 'TB');

    expect(edge.sourceHandle).toBe('bottom');
    expect(edge.targetHandle).toBe('top');
    expect(edge.type).toBe('stablePath');
    expect(edge.data).toMatchObject({
      layoutPathLocked: true,
      _layoutPathLocked: true,
      sharedTrunkAware: true,
      stablePathQuality: { strictCrossings: 0 },
      _layoutEpoch: 123,
    });
    expect((edge.data as any).computedPath).toEqual([
      { x: 50, y: 40 },
      { x: 50, y: 120 },
    ]);
  });
});

describe('resolveLayoutStrategyGeneratedGroupOptions', () => {
  it('preserves standard preset group visibility contracts', () => {
    expect(resolveLayoutStrategyGeneratedGroupOptions({
      layout: {
        generateDomainGroups: false,
        generateSubDomainGroups: true,
        domainWhitelist: ['external'],
        subDomainWhitelist: ['物流执行层'],
      },
    })).toEqual({
      generateDomainGroups: false,
      generateSubDomainGroups: true,
      domainWhitelist: ['external'],
      subDomainWhitelist: ['物流执行层'],
    });
  });

  it('keeps legacy layout defaults when presets do not specify group visibility', () => {
    expect(resolveLayoutStrategyGeneratedGroupOptions({ layout: {} })).toEqual({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
      domainWhitelist: undefined,
      subDomainWhitelist: undefined,
    });
  });

  it('preserves a subdomain-only canvas contract when preset lookup is unavailable', () => {
    const currentNodes = [
      {
        id: 'subgroup-wms-tms-物流执行层',
        type: 'subGroup',
        position: { x: 0, y: 0 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
      {
        id: 'wms-outbound',
        type: 'custom',
        parentId: 'subgroup-wms-tms-物流执行层',
        position: { x: 40, y: 80 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
    ] as Node[];

    expect(resolveLayoutStrategyGeneratedGroupOptions(undefined, currentNodes)).toEqual({
      generateDomainGroups: false,
      generateSubDomainGroups: true,
      domainWhitelist: undefined,
      subDomainWhitelist: ['物流执行层'],
    });
  });
});

describe('stripHiddenGeneratedLayoutNodes', () => {
  it('removes hidden or contract-forbidden generated containers before rendering', () => {
    const nodes = [
      {
        id: 'titlegroup-external',
        type: 'titleGroup',
        position: { x: 0, y: 0 },
        data: { domain: 'external' },
      },
      {
        id: 'subgroup-wms-tms-物流执行层',
        type: 'subGroup',
        position: { x: 0, y: 0 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
      {
        id: 'titlegroup-hidden',
        type: 'titleGroup',
        hidden: true,
        position: { x: 0, y: 0 },
        data: { domain: 'hidden', hidden: true },
      },
      {
        id: 'wms-outbound',
        type: 'custom',
        position: { x: 40, y: 80 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
    ] as Node[];

    expect(stripHiddenGeneratedLayoutNodes(nodes, {
      generateDomainGroups: false,
      generateSubDomainGroups: true,
      domainWhitelist: undefined,
      subDomainWhitelist: ['物流执行层'],
    }).map(node => node.id)).toEqual([
      'subgroup-wms-tms-物流执行层',
      'wms-outbound',
    ]);
  });
});

describe('resolveLayoutStrategyPresetFromCandidates', () => {
  it('falls back to later candidate ids when the first id is not a standard preset', () => {
    const preset = { layout: { generateDomainGroups: false } };

    expect(resolveLayoutStrategyPresetFromCandidates(
      { SystemsInteractionStandardData: preset },
      ['export-name', 'SystemsInteractionStandardData'],
    )).toEqual({
      id: 'SystemsInteractionStandardData',
      preset,
    });
  });
});

describe('loadLayoutStrategyPresetFromCandidates', () => {
  it('loads the preset map through the application-provided port', async () => {
    const preset = { layout: { domainOrder: ['业务域'] } };

    await expect(loadLayoutStrategyPresetFromCandidates(
      async () => ({ standard: preset }),
      ['missing', 'standard'],
    )).resolves.toEqual({ id: 'standard', preset });
  });

  it('returns no preset when the optional port is not configured', async () => {
    await expect(loadLayoutStrategyPresetFromCandidates(undefined, ['standard']))
      .resolves.toEqual({});
  });

  it('propagates provider failures to the layout error boundary', async () => {
    const failure = new Error('preset provider unavailable');

    await expect(loadLayoutStrategyPresetFromCandidates(
      async () => { throw failure; },
      ['standard'],
    )).rejects.toBe(failure);
  });
});

describe('normalizeLayoutVisibilityNodes', () => {
  it('preserves hidden generated containers during layout normalization', () => {
    const nodes = [
      {
        id: 'titlegroup-external',
        type: 'titleGroup',
        position: { x: 0, y: 0 },
        hidden: true,
        data: { domain: 'external', hidden: true },
      },
      {
        id: 'business',
        type: 'flowchart',
        position: { x: 10, y: 10 },
        data: { domain: 'external' },
      },
    ] as Node[];

    const result = normalizeLayoutVisibilityNodes(nodes);

    expect(result[0]).toMatchObject({
      id: 'titlegroup-external',
      hidden: true,
      data: { hidden: true },
    });
    expect(result[1]).toMatchObject({
      id: 'business',
      hidden: false,
    });
  });
});
