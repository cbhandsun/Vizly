// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text || '').length * 8 }),
    }),
  });
});

vi.mock('../../../components/config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: () => ({
      domain: {
        padding: { horizontal: 20, bottom: 18 },
        title: { height: 40, padding: { vertical: 10 }, safeGap: 12 },
        bottomSafeGap: 18,
        sideSafeGap: 8,
        gap: 10,
      },
      layout: {
        autoGapScale: { h: 1 },
        domainWidthBySubGroupsOnly: true,
      },
      subDomain: {
        padding: { horizontal: 20, top: 35, bottom: 15 },
      },
    }),
    getLayoutConfig: () => ({
      NODE_H_GAP: 80,
      NODE_V_GAP: 50,
      NODE_MIN_WIDTH: 80,
      ENSURE_SUB_GROUP_TITLE_CLEARANCE: true,
      SUB_GROUP_TITLE_CLEARANCE: 45,
      SUB_GROUP_PADDING: { H: 20, V_TOP: 35, V_BOTTOM: 15 },
    }),
  },
}));

vi.mock('../../../components/layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidth: (text: string) => 80 + String(text || '').length * 5,
      calculateNodeHeight: () => 40,
    }),
  },
}));

import {
  applyDomainGrouping,
  clampDomainHeightsToSubGroups,
  clampNodesToContainers,
  countDomainContainerOverlaps,
  enforceDomainContainerStrictContainment,
  finalizeDomainHeightsByProjection,
  finalizeDomainWidthsByProjection,
  resolveDomainContainerOverlaps,
} from '../domainContainers';

const node = (id: string, x: number, y: number, width = 80, height = 40, data: any = {}) => ({
  id,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data: { domain: 'D', ...data },
});

const titleGroup = (id: string, domain: string, x: number, y: number, width: number, height: number, data: any = {}) => ({
  id,
  type: 'titleGroup',
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data: { domain, ...data },
});

const subGroup = (id: string, domain: string, x: number, y: number, width: number, height: number, children: string[] = []) => ({
  id,
  type: 'subGroup',
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data: { domain, subDomain: id, children },
});

describe('domain container layout helpers', () => {
  it('creates deterministic domain containers with majority domain class and whitelist visibility', () => {
    const result = applyDomainGrouping([
      node('a', 100, 100, 80, 40, { domainClass: 'wms' }),
      node('b', 220, 120, 60, 30, { domainClass: 'wms' }),
      node('x', 0, 0, 20, 20, { domain: 'X', domainClass: 'erp' }),
    ] as never, ['X']);

    const domain = result.find(n => n.id === 'titlegroup-D') as any;
    expect(domain.position).toEqual({ x: 80, y: 38 });
    expect(domain.style).toMatchObject({ width: 300, height: 130 });
    expect(domain.data.domainClass).toBe('wms');
    expect(domain.data.hidden).toBe(true);
  });

  it('recomputes strict containment from subgroup projection while preserving the left anchor', () => {
    const result = enforceDomainContainerStrictContainment([
      titleGroup('tg', 'D', 0, 0, 80, 80),
      subGroup('sg', 'D', 100, 100, 200, 80),
      node('free', 10, 10, 80, 40),
    ] as never);

    const domain = result.find(n => n.id === 'tg') as any;
    expect(domain.position.x).toBe(0);
    expect(domain.position.y).toBe(38);
    expect(domain.measured.width).toBe(260);
    expect(domain.measured.height).toBe(160);
  });

  it('resolves overlapping domain containers and translates their members together', () => {
    const result = resolveDomainContainerOverlaps([
      titleGroup('a-domain', 'A', 0, 0, 100, 100),
      node('a-node', 10, 20, 20, 20, { domain: 'A' }),
      titleGroup('b-domain', 'B', 50, 0, 100, 100),
      node('b-node', 60, 20, 20, 20, { domain: 'B' }),
    ] as never, 10);

    const bDomain = result.find(n => n.id === 'b-domain') as any;
    const bNode = result.find(n => n.id === 'b-node') as any;
    expect(bDomain.position.y).toBe(110);
    expect(bNode.position.y).toBe(130);
    expect(countDomainContainerOverlaps(result as never)).toBe(0);
  });

  it('finalizes domain projection sizes and clamps heights to subgroup bounds', () => {
    const projectedWidth = finalizeDomainWidthsByProjection([
      titleGroup('tg', 'D', 0, 0, 100, 80),
      subGroup('sg', 'D', 30, 70, 100, 80),
    ] as never);
    expect((projectedWidth.find(n => n.id === 'tg') as any).measured.width).toBe(164);

    const projectedHeight = finalizeDomainHeightsByProjection(projectedWidth as never);
    expect((projectedHeight.find(n => n.id === 'tg') as any).measured.height).toBe(168);

    const clamped = clampDomainHeightsToSubGroups([
      titleGroup('tg', 'D', 0, 0, 100, 80),
      subGroup('sg', 'D', 30, 120, 100, 90),
    ] as never);
    expect((clamped.find(n => n.id === 'tg') as any).measured.height).toBe(228);
  });

  it('clamps subgroup children and domain members into their container interiors', () => {
    const result = clampNodesToContainers([
      titleGroup('tg', 'D', 0, 0, 180, 180),
      subGroup('sg', 'D', 40, 80, 120, 100, ['child']),
      node('child', -100, -100, 40, 30),
      node('free', -200, -200, 40, 30),
    ] as never);

    const child = result.find(n => n.id === 'child') as any;
    const free = result.find(n => n.id === 'free') as any;
    expect(child.position.x).toBeGreaterThanOrEqual(60);
    expect(child.position.y).toBeGreaterThanOrEqual(125);
    expect(free.position.x).toBeGreaterThanOrEqual(20);
    expect(free.position.y).toBeGreaterThanOrEqual(62);
  });
});
