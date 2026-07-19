// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text || '').length * 8 }),
    }),
  });
});

vi.mock('../../../config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: () => ({
      domain: {
        padding: { horizontal: 20 },
        title: { height: 40, padding: { vertical: 10 }, safeGap: 12 },
      },
      subDomain: {
        padding: { horizontal: 20, top: 40, bottom: 20 },
        title: { height: 30, padding: { vertical: 6 }, safeGap: 4 },
      },
      node: { height: 30, width: 60 },
    }),
    getLayoutConfig: () => ({
      NODE_H_GAP: 50,
      NODE_V_GAP: 40,
      NODE_MIN_WIDTH: 60,
      SUB_GROUP_PADDING: { H: 20, V_TOP: 40, V_BOTTOM: 20 },
      SUB_GROUP_TITLE_HEIGHT: 30,
      SUB_GROUP_TITLE_SAFE_GAP: 6,
      SUB_GROUP_TITLE_CLEARANCE: 40,
      ENSURE_SUB_GROUP_TITLE_CLEARANCE: true,
    }),
  },
}));

vi.mock('../../../components/layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidth: (text: string) => 60 + String(text || '').length * 4,
      calculateNodeHeight: () => 30,
    }),
  },
}));

import {
  centerSubGroupChildrenHorizontally,
  centerSubGroupsInDomain,
  countSubGroupOverlapsByDomain,
  enforceSubGroupStrictContainmentByChildren,
  enforceDomainNoOverlapStrict,
  enforceGlobalNoOverlapStrict,
  enforceSubGroupNoOverlapStrict,
  enforceSubGroupTitleClearance,
  expandSubGroupContainersBySemantic,
  expandSubGroupsToDomainWidth,
  finalizeSubGroupHeightsByProjection,
  finalizeSubGroupHeightsByProjectionPreserveAnchor,
  finalizeSubGroupWidthsByProjectionPreserveAnchor,
  layoutNodesByGhostDomainColumns,
  laneGridPackByDomain,
  leftAlignSubGroupChildrenHorizontally,
  packDomainNodesGrid,
  packSubGroupChildrenRigid,
  packSubGroupChildrenGridStrict,
  packSubGroupsInDomain,
  recomputeSubGroupContainersBasic,
  rankSnapDomainFreeNodes,
  rankSnapSubGroupChildren,
  resolveAllNodeOverlapsGlobal,
  resolveFreeNodeOverlapsInDomain,
  reflowSubGroupChildrenVertical,
  syncDagreChildPositions,
  resolveSubGroupOverlaps,
  resolveSubGroupChildrenOverlapsStrict,
  scaleDomainContentToFitWidth,
  snapFreeNodesToRowsInDomain,
  snapSubGroupChildrenToRowsStrict,
  splitDenseRowsInSubGroupsAdaptive,
  stackSubGroupsVertically,
  strengthenDomainsAggressive,
  strengthenSubGroupsInDomainWithGridStrict,
  unifySubGroupLeftAnchors,
  writeSubGroupChildrenRelativeOffsets,
} from '../subGroupLayout';

const child = (id: string, x: number, y: number, data: any = {}) => ({
  id,
  position: { x, y },
  measured: { width: 60, height: 30 },
  style: { width: 60, height: 30 },
  data: { domain: 'D', subDomain: 'S', ...data },
});

const sg = (children: string[] = ['a', 'b', 'c'], width = 400, height = 250) => ({
  id: 'sg',
  type: 'subGroup',
  position: { x: 100, y: 100 },
  measured: { width, height },
  style: { width, height },
  data: { domain: 'D', subDomain: 'S', children },
});

const domain = (width = 500, height = 360) => ({
  id: 'domain',
  type: 'titleGroup',
  position: { x: 0, y: 0 },
  measured: { width, height },
  style: { width, height },
  data: { domain: 'D' },
});

const sgNode = (id: string, x: number, y: number, width = 120, height = 100, children: string[] = []) => ({
  id,
  type: 'subGroup',
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data: { domain: 'D', subDomain: id, children },
});

const byId = (nodes: any[], id: string) => nodes.find(n => n.id === id) as any;
const rectOf = (node: any) => ({
  x: node.position.x,
  y: node.position.y,
  w: node.measured?.width ?? node.style?.width ?? node.width,
  h: node.measured?.height ?? node.style?.height ?? node.height,
});
const overlaps = (a: any, b: any) => {
  const ra = rectOf(a);
  const rb = rectOf(b);
  return ra.x < rb.x + rb.w && ra.x + ra.w > rb.x && ra.y < rb.y + rb.h && ra.y + ra.h > rb.y;
};

describe('subGroup layout helpers', () => {
  it('snaps free domain nodes into centered non-overlapping rows', () => {
    const result = snapFreeNodesToRowsInDomain([
      { id: 'domain', type: 'titleGroup', position: { x: 0, y: 0 }, measured: { width: 400, height: 300 }, style: { width: 400, height: 300 }, data: { domain: 'D' } },
      child('a', 10, 110, { subDomain: undefined }),
      child('b', 300, 115, { subDomain: undefined }),
    ] as never);

    const xs = result.filter(n => ['a', 'b'].includes(n.id)).map(n => (n as any).position.x).sort((a, b) => a - b);
    expect(xs).toEqual([115, 225]);
  });

  it('packs subgroup children into strict rows and resizes the subgroup to content', () => {
    const result = snapSubGroupChildrenToRowsStrict([
      sg(),
      child('a', 0, 110),
      child('b', 300, 115),
      child('c', 180, 200),
    ] as never);

    const a = result.find(n => n.id === 'a') as any;
    const b = result.find(n => n.id === 'b') as any;
    const c = result.find(n => n.id === 'c') as any;
    const packed = result.find(n => n.id === 'sg') as any;

    expect(a.position.y).toBe(140);
    expect(b.position.y).toBe(140);
    expect(c.position.y).toBeGreaterThan(a.position.y);
    expect(packed.measured.height).toBeGreaterThan(100);
  });

  it('rank-snaps subgroup children and free domain nodes into stable layers', () => {
    const rankedSub = rankSnapSubGroupChildren([
      sg(['a', 'b', 'c'], 340, 260),
      child('a', 110, 148),
      child('b', 280, 152),
      child('c', 180, 230),
    ] as never);

    expect(byId(rankedSub, 'a').position.y).toBe(140);
    expect(byId(rankedSub, 'b').position.y).toBe(140);
    expect(byId(rankedSub, 'c').position.y).toBeGreaterThan(byId(rankedSub, 'a').position.y);
    expect(byId(rankedSub, 'sg').measured.height).toBeGreaterThan(110);

    const rankedFree = rankSnapDomainFreeNodes([
      domain(420, 300),
      child('a', 20, 100, { subDomain: undefined }),
      child('b', 280, 104, { subDomain: undefined }),
      child('c', 180, 190, { subDomain: undefined }),
    ] as never);

    expect(byId(rankedFree, 'a').position.y).toBe(62);
    expect(byId(rankedFree, 'b').position.y).toBe(62);
    expect(byId(rankedFree, 'c').position.y).toBeGreaterThan(byId(rankedFree, 'a').position.y);
  });

  it('separates overlapping business nodes globally and within a domain', () => {
    const base = [
      child('a', 0, 0, { subDomain: undefined }),
      child('b', 10, 5, { subDomain: undefined }),
      child('c', 260, 0, { domain: 'E', subDomain: undefined }),
    ] as any[];

    const global = resolveAllNodeOverlapsGlobal(base as never, 20, 20) as any[];
    expect(overlaps(byId(global, 'a'), byId(global, 'b'))).toBe(false);
    expect(byId(global, 'c').position).toEqual({ x: 260, y: 0 });

    const strict = enforceGlobalNoOverlapStrict(base as never, 20, 20, 2) as any[];
    expect(overlaps(byId(strict, 'a'), byId(strict, 'b'))).toBe(false);

    const domainOnly = resolveFreeNodeOverlapsInDomain([
      domain(420, 300),
      child('a', 20, 100, { subDomain: undefined }),
      child('b', 30, 105, { subDomain: undefined }),
      child('c', 30, 105, { domain: 'E', subDomain: undefined }),
    ] as never, 20, 20) as any[];
    expect(overlaps(byId(domainOnly, 'a'), byId(domainOnly, 'b'))).toBe(false);
    expect(byId(domainOnly, 'c').position).toEqual({ x: 30, y: 105 });
  });

  it('packs domain content with grid, ghost columns, and lane columns', () => {
    const loose = [
      child('a', 0, 0, { subDomain: undefined }),
      child('b', 10, 10, { subDomain: undefined }),
      child('c', 20, 20, { subDomain: undefined }),
      child('x', 500, 0, { domain: 'E', subDomain: undefined }),
      child('y', 510, 10, { domain: 'E', subDomain: undefined }),
    ] as any[];

    const grid = packDomainNodesGrid(loose as never, 'D', 30, 30) as any[];
    expect(byId(grid, 'b').position.y).toBeGreaterThanOrEqual(40);
    expect(byId(grid, 'x').position).toEqual({ x: 500, y: 0 });

    const strict = enforceDomainNoOverlapStrict(loose as never, 'D', 20, 20, 2) as any[];
    expect(overlaps(byId(strict, 'a'), byId(strict, 'b'))).toBe(false);

    const strengthened = strengthenDomainsAggressive(loose as never, ['D'], 20, 20) as any[];
    expect(overlaps(byId(strengthened, 'a'), byId(strengthened, 'b'))).toBe(false);

    const ghost = layoutNodesByGhostDomainColumns(loose as never) as any[];
    expect(byId(ghost, 'x').position.x).toBeGreaterThan(byId(ghost, 'a').position.x);

    const lanes = laneGridPackByDomain(loose as never, 30, 30, 'vertical') as any[];
    expect(byId(lanes, 'x').position.x).toBeGreaterThan(byId(lanes, 'a').position.x);
  });

  it('grid-packs, de-overlaps, and splits dense subgroup children', () => {
    const dense = [
      sg(['a', 'b', 'c', 'd', 'e'], 260, 160),
      child('a', 120, 150, { sequence: 3 }),
      child('b', 120, 150, { sequence: 1 }),
      child('c', 120, 150, { sequence: 2 }),
      child('d', 120, 150, { sequence: 4 }),
      child('e', 120, 150, { sequence: 5 }),
    ] as any[];

    const grid = packSubGroupChildrenGridStrict(dense as never) as any[];
    expect(byId(grid, 'b').position.x).toBeLessThanOrEqual(byId(grid, 'c').position.x);
    expect(byId(grid, 'd').position.y).toBeGreaterThanOrEqual(byId(grid, 'b').position.y);

    const separated = enforceSubGroupNoOverlapStrict(dense as never, 20, 20, 3) as any[];
    expect(byId(separated, 'a').position).not.toEqual(byId(dense, 'a').position);
    expect(byId(separated, 'b').position.x).toBeGreaterThanOrEqual(byId(separated, 'sg').position.x + 20);

    const strict = resolveSubGroupChildrenOverlapsStrict(dense as never, 20, 20) as any[];
    expect(byId(strict, 'a').position.y).toBeGreaterThanOrEqual(byId(strict, 'sg').position.y + 40);

    const split = splitDenseRowsInSubGroupsAdaptive(dense as never, 2) as any[];
    const childYs = ['a', 'b', 'c', 'd', 'e'].map(id => byId(split, id).position.y);
    expect(new Set(childYs).size).toBeGreaterThan(1);
    expect(byId(split, 'sg').measured.height).toBeGreaterThan(byId(dense, 'sg').measured.height);

    const strengthened = strengthenSubGroupsInDomainWithGridStrict(dense as never, 'D', 20, 20, 2) as any[];
    expect(byId(strengthened, 'sg').measured.width).toBeGreaterThan(0);
    expect(byId(strengthened, 'a').position.y).toBeGreaterThanOrEqual(byId(strengthened, 'sg').position.y);
  });

  it('records subgroup-relative offsets and rigidly repacks children by those offsets', () => {
    const withOffsets = writeSubGroupChildrenRelativeOffsets([
      sg(['a', 'b']),
      child('a', 150, 200),
      child('b', 240, 200),
    ] as never);

    const aWithRel = withOffsets.find(n => n.id === 'a') as any;
    expect(aWithRel.data.__rel).toEqual({ x: 30, y: 24 });

    const packed = packSubGroupChildrenRigid(
      sg(['a', 'b'], 260, 160) as never,
      [
        child('a', 0, 0, { __rel: { x: 0, y: 0 } }),
        child('b', 0, 0, { __rel: { x: 10, y: 0 } }),
      ] as never,
      30,
      35,
    );

    const [, a, b] = packed as any[];
    expect(a.position.x).toBe(120);
    expect(b.position.x).toBe(210);
    expect(a.position.y).toBe(180);
  });

  it('reflows children vertically in subgroup content area', () => {
    const result = reflowSubGroupChildrenVertical(
      sg(['a', 'b'], 300, 220) as never,
      [
        child('b', 0, 0, { __rel: { y: 80 } }),
        child('a', 0, 0, { __rel: { y: 0 } }),
      ] as never,
      20,
      35,
    );

    const [, a, b] = result as any[];
    expect(a.id).toBe('a');
    expect(a.position.x).toBe(220);
    expect(a.position.y).toBe(180);
    expect(b.position.y).toBe(245);
  });

  it('warns via safeLog when synced Dagre children approach the subgroup title boundary', () => {
    const result = syncDagreChildPositions([
      sg(['a'], 300, 220),
      child('a', 0, 0, { __dagreRel: { x: 10, y: 0 } }),
    ] as never) as any[];

    const syncedChild = byId(result, 'a');
    expect(syncedChild.position.x).toBe(130);
    expect(syncedChild.position.y).toBe(184);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DAGRE-SYNC-ALERT] Child a is very close to innerTop (184). Overlap risk!'
    );
  });

  it('centers and left-aligns subgroup children within the actual subgroup width', () => {
    const base = [
      sg(['a', 'b'], 300, 180),
      child('a', 100, 160),
      child('b', 250, 160),
    ] as never;

    const centered = centerSubGroupChildrenHorizontally(base);
    expect((centered.find(n => n.id === 'a') as any).position.x).toBe(165);
    expect((centered.find(n => n.id === 'b') as any).position.x).toBe(275);

    const leftAligned = leftAlignSubGroupChildrenHorizontally(base);
    expect((leftAligned.find(n => n.id === 'a') as any).position.x).toBe(120);
    expect((leftAligned.find(n => n.id === 'b') as any).position.x).toBe(230);
  });

  it('expands and strictly contains subgroup containers from semantic children', () => {
    const base = [
      sg(['a', 'b'], 80, 80),
      child('a', 200, 180),
      child('b', 320, 184),
    ] as never;

    const expanded = expandSubGroupContainersBySemantic(base);
    const expandedSg = expanded.find(n => n.id === 'sg') as any;
    expect(expandedSg.position.x).toBe(180);
    expect(expandedSg.position.y).toBe(140);
    expect(expandedSg.measured.width).toBeGreaterThan(200);

    const contained = enforceSubGroupStrictContainmentByChildren(base);
    const containedSg = contained.find(n => n.id === 'sg') as any;
    expect(containedSg.measured.width).toBe(220);
    expect(containedSg.measured.height).toBe(134);
  });

  it('resolves subgroup overlaps and keeps child positions translated with their container', () => {
    const result = resolveSubGroupOverlaps([
      sgNode('sg-a', 100, 100, 120, 80, ['a']),
      child('a', 120, 130, { subDomain: 'sg-a' }),
      sgNode('sg-b', 150, 100, 120, 80, ['b']),
      child('b', 170, 130, { subDomain: 'sg-b' }),
    ] as never, 20, 30);

    expect(countSubGroupOverlapsByDomain(result as never)).toBe(0);
    expect((result.find(n => n.id === 'sg-b') as any).position.y).toBeGreaterThan(100);
    expect((result.find(n => n.id === 'b') as any).position.y).toBeGreaterThan(130);
  });

  it('recomputes subgroup containers and projection dimensions from child bounds', () => {
    const recomputed = recomputeSubGroupContainersBasic([
      sg(['a', 'b'], 80, 80),
      child('a', 200, 180),
      child('b', 320, 260),
    ] as never);
    const recomputedSg = recomputed.find(n => n.id === 'sg') as any;
    expect(recomputedSg.position).toEqual({ x: 178, y: 100 });
    expect(recomputedSg.measured.width).toBeGreaterThan(180);
    expect(recomputedSg.measured.height).toBeGreaterThanOrEqual(200);

    const heights = finalizeSubGroupHeightsByProjection([
      domain(),
      sg(['a', 'b'], 300, 80),
      child('a', 140, 180),
      child('b', 240, 260),
    ] as never);
    expect((heights.find(n => n.id === 'sg') as any).measured.height).toBe(210);

    const preserveHeight = finalizeSubGroupHeightsByProjectionPreserveAnchor([
      sg(['a'], 300, 80),
      child('a', 140, 240),
    ] as never);
    expect((preserveHeight.find(n => n.id === 'sg') as any).position).toEqual({ x: 100, y: 100 });
    expect((preserveHeight.find(n => n.id === 'sg') as any).measured.height).toBe(190);

    const preserveWidth = finalizeSubGroupWidthsByProjectionPreserveAnchor([
      sg(['a', 'b'], 300, 80),
      child('a', 140, 180),
      child('b', 280, 180),
    ] as never);
    expect((preserveWidth.find(n => n.id === 'sg') as any).position.x).toBe(100);
    expect((preserveWidth.find(n => n.id === 'sg') as any).measured.width).toBe(240);
  });

  it('packs, centers, anchors, and stacks subgroups within a domain while moving children', () => {
    const base = [
      domain(500, 360),
      sgNode('sg-a', 20, 20, 100, 80, ['a']),
      child('a', 40, 50, { subDomain: 'sg-a' }),
      sgNode('sg-b', 80, 60, 100, 80, ['b']),
      child('b', 100, 90, { subDomain: 'sg-b' }),
    ] as never;

    const packed = packSubGroupsInDomain(base);
    expect((packed.find(n => n.id === 'sg-a') as any).position.y).toBe(62);
    expect((packed.find(n => n.id === 'a') as any).position.y).toBe(92);

    const centered = centerSubGroupsInDomain([
      domain(500, 360),
      sgNode('sg-a', 40, 80, 100, 80, ['a']),
      child('a', 60, 110, { subDomain: 'sg-a' }),
      sgNode('sg-b', 160, 80, 100, 80, ['b']),
      child('b', 180, 110, { subDomain: 'sg-b' }),
    ] as never);
    expect((centered.find(n => n.id === 'sg-a') as any).position.x).toBe(140);
    expect((centered.find(n => n.id === 'a') as any).position.x).toBe(160);

    const anchored = unifySubGroupLeftAnchors([
      domain(500, 360),
      sgNode('sg-a', 200, 80, 100, 80, ['a']),
      child('a', 220, 110, { subDomain: 'sg-a' }),
    ] as never);
    expect((anchored.find(n => n.id === 'sg-a') as any).position.x).toBe(8);
    expect((anchored.find(n => n.id === 'a') as any).position.x).toBe(28);

    const stacked = stackSubGroupsVertically([
      domain(500, 360),
      { ...sgNode('sg-b', 100, 220, 100, 80, ['b']), data: { domain: 'D', subDomain: 'sg-b', children: ['b'], sequence: 2 } },
      child('b', 120, 250, { subDomain: 'sg-b' }),
      { ...sgNode('sg-a', 100, 120, 100, 80, ['a']), data: { domain: 'D', subDomain: 'sg-a', children: ['a'], sequence: 1 } },
      child('a', 120, 150, { subDomain: 'sg-a' }),
    ] as never);
    expect((stacked.find(n => n.id === 'sg-a') as any).position.y).toBe(62);
    expect((stacked.find(n => n.id === 'sg-b') as any).position.y).toBe(182);
    expect((stacked.find(n => n.id === 'b') as any).position.y).toBe(212);
  });

  it('enforces title clearance and expands subgroups to domain width', () => {
    const cleared = enforceSubGroupTitleClearance([
      sg(['a'], 220, 160),
      child('a', 50, 90),
    ] as never);
    const a = cleared.find(n => n.id === 'a') as any;
    expect(a.position.x).toBe(120);
    expect(a.position.y).toBe(180);

    const expanded = expandSubGroupsToDomainWidth([
      domain(500, 360),
      sgNode('sg-a', 140, 120, 100, 80),
    ] as never);
    const widened = expanded.find(n => n.id === 'sg-a') as any;
    expect(widened.position.x).toBe(0);
    expect(widened.measured.width).toBe(460);
  });

  it('scales same-domain content horizontally to fit available domain width', () => {
    const result = scaleDomainContentToFitWidth([
      domain(500, 360),
      sgNode('sg-a', 100, 120, 100, 80),
      child('a', 250, 140),
    ] as never);

    const scaledSg = result.find(n => n.id === 'sg-a') as any;
    const scaledChild = result.find(n => n.id === 'a') as any;
    expect(scaledSg.position.x).toBe(28);
    expect(scaledSg.measured.width).toBeGreaterThan(100);
    expect(scaledChild.position.x).toBeGreaterThan(scaledSg.position.x + scaledSg.measured.width);
    expect(scaledChild.measured.width).toBeGreaterThan(60);
  });
});
