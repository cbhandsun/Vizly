import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  equalizeVisibleSubGroupHeightsByDomain,
  expandDomainWidthsFromVisibleVerticalBands,
  projectAndUnifyDomainContainerBounds,
  projectAndUnifyDeterministicDomainWidths,
  projectAndUnifySemanticDomainWidths,
  projectDomainHeightsFromVisibleMembers,
  projectSingleDomainContainer,
  unifyContainerWidthsByMaximum,
} from '../domainVerticalContainerProjection';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  y: number,
  width: number,
  height: number,
  hidden = false,
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  width,
  height,
  data: { domain, hidden },
});

describe('domainVerticalContainerProjection', () => {
  it('projects one domain from visible members and advances the domain cursor', () => {
    const input = [
      node('domain-a', 'titleGroup', ' A ', 10, 20, 300, 500),
      node('visible-a', 'default', 'A', 140, 100, 180, 60),
      node('visible-a2', 'subGroup', ' A ', 400, 130, 100, 120),
      node('hidden-a', 'default', 'A', 2000, 3000, 400, 500, true),
      node('foreign', 'default', 'B', 4000, 5000, 400, 500),
    ];

    const result = projectSingleDomainContainer(input, {
      containerId: 'domain-a',
      domainKey: ' A ',
      left: 80,
      top: 40,
      memberFallbackLeft: 100,
      memberFallbackTop: 90,
      horizontalPadding: 20,
      sideSafeGap: 10,
      widthCompensation: 1.1,
      headerHeight: 50,
      bottomSafeGap: 20,
      extraVerticalPadding: 5,
      domainGap: 30,
      defaultMemberWidth: 240,
      defaultMemberHeight: 80,
    });

    expect(result.nodes[0].position).toEqual({ x: 80, y: 40 });
    expect(result.nodes[0].measured).toEqual({ width: 462, height: 235 });
    expect(result.nextTop).toBe(305);
    expect(input[0].position).toEqual({ x: 10, y: 20 });
  });

  it('collapses an empty domain to its header and preserves its current width', () => {
    const result = projectSingleDomainContainer([
      node('domain-a', 'titleGroup', 'A', 10, 20, 420, 500),
      node('hidden-a', 'default', 'A', 2000, 3000, 400, 500, true),
    ], {
      containerId: 'domain-a',
      domainKey: 'A',
      left: 80,
      top: 40,
      memberFallbackLeft: 100,
      memberFallbackTop: 90,
      horizontalPadding: 20,
      sideSafeGap: 10,
      widthCompensation: 1.1,
      headerHeight: 50,
      bottomSafeGap: 20,
      extraVerticalPadding: 5,
      domainGap: 30,
      defaultMemberWidth: 240,
      defaultMemberHeight: 80,
    });

    expect(result.nodes[0].measured).toEqual({ width: 420, height: 50 });
    expect(result.nextTop).toBe(120);
  });

  it('sanitizes invalid single-domain geometry and missing containers', () => {
    const invalid = projectSingleDomainContainer([
      node(
        'domain-a',
        'titleGroup',
        'A',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        300,
        500,
      ),
      node(
        'member-a',
        'default',
        'A',
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -10,
      ),
    ], {
      containerId: 'domain-a',
      domainKey: 'A',
      left: Number.NaN,
      top: Number.POSITIVE_INFINITY,
      memberFallbackLeft: Number.NaN,
      memberFallbackTop: Number.NEGATIVE_INFINITY,
      horizontalPadding: -10,
      sideSafeGap: Number.NaN,
      widthCompensation: -1,
      headerHeight: Number.NaN,
      bottomSafeGap: -20,
      extraVerticalPadding: Number.POSITIVE_INFINITY,
      domainGap: -30,
      defaultMemberWidth: Number.NaN,
      defaultMemberHeight: Number.NaN,
    });
    const missing = projectSingleDomainContainer([], {
      containerId: 'missing',
      domainKey: 'A',
      left: 0,
      top: 20,
      memberFallbackLeft: 0,
      memberFallbackTop: 0,
      horizontalPadding: 0,
      sideSafeGap: 0,
      widthCompensation: 1,
      headerHeight: 0,
      bottomSafeGap: 0,
      extraVerticalPadding: 0,
      domainGap: 10,
      defaultMemberWidth: 240,
      defaultMemberHeight: 80,
    });

    expect(invalid.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(invalid.nodes[0].measured).toEqual({ width: 300, height: 80 });
    expect(Number.isFinite(invalid.nextTop)).toBe(true);
    expect(missing).toEqual({ nodes: [], nextTop: 30 });
  });

  it('unifies deterministic domain widths from visible subgroup rows', () => {
    const input = [
      node('domain-a', 'titleGroup', ' A ', 100, 0, 300, 200),
      node('sub-a1', 'subGroup', 'A', 130, 80, 200, 100),
      node('sub-a2', 'subGroup', ' A ', 300, 80, 250, 100),
      node('free-a1', 'default', 'A', 140, 240, 120, 60),
      node('free-a2', 'default', 'A', 300, 240, 130, 60),
      node('hidden-a', 'subGroup', 'A', 4000, 80, 1000, 100, true),
      node('domain-b', 'titleGroup', 'B', 100, 400, 480, 220),
    ];

    const result = projectAndUnifyDeterministicDomainWidths(input, {
      containerTypes: new Set(['titleGroup']),
      anchorLeft: 100,
      horizontalPadding: 20,
      subGroupGap: 30,
      freeNodeGap: 40,
      defaultMemberWidth: 240,
      fallbackContainerHeight: 80,
    });
    const domains = result.filter(item => item.type === 'titleGroup');

    expect(domains.map(item => item.measured?.width)).toEqual([525, 525]);
    expect(domains.map(item => item.measured?.height)).toEqual([200, 220]);
    expect(input[0].measured?.width).toBe(300);
  });

  it('preserves finite current widths for empty or invalid deterministic domains', () => {
    const result = projectAndUnifyDeterministicDomainWidths([
      node(
        'domain-a',
        'titleGroup',
        'A',
        Number.NaN,
        0,
        300,
        Number.NaN,
      ),
      node('domain-b', 'titleGroup', 'B', 0, 200, 200, 120),
      node(
        'invalid-a',
        'default',
        'A',
        Number.POSITIVE_INFINITY,
        80,
        Number.NEGATIVE_INFINITY,
        60,
        true,
      ),
    ], {
      containerTypes: new Set(['titleGroup']),
      anchorLeft: Number.NaN,
      horizontalPadding: -20,
      subGroupGap: Number.POSITIVE_INFINITY,
      freeNodeGap: -40,
      defaultMemberWidth: Number.NaN,
      fallbackContainerHeight: Number.NaN,
    });

    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(result[0].measured).toEqual({ width: 300, height: 80 });
    expect(result[1].measured).toEqual({ width: 300, height: 120 });
  });

  it('equalizes visible subgroup heights while preserving anchors and widths', () => {
    const input = [
      node('domain-a', 'titleGroup', 'A', 10, 20, 500, 300),
      node('sub-a1', 'subGroup', 'A', 30, 80, 180, 100),
      node('sub-a2', 'subGroup', 'A', 240, 80, 220, 160),
      node('sub-hidden', 'subGroup', 'A', 30, 300, 100, 400, true),
    ];

    const result = equalizeVisibleSubGroupHeightsByDomain(input, 80);
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('sub-a1')?.position).toEqual({ x: 30, y: 80 });
    expect(byId.get('sub-a1')?.measured).toEqual({ width: 180, height: 160 });
    expect(byId.get('sub-a2')?.measured).toEqual({ width: 220, height: 160 });
    expect(byId.get('sub-hidden')?.measured?.height).toBe(400);
    expect(input[1].measured?.height).toBe(100);
  });

  it('leaves single subgroups and domains without title containers unchanged', () => {
    const input = [
      node('domain-a', 'titleGroup', 'A', 0, 0, 400, 200),
      node('sub-a', 'subGroup', 'A', 20, 60, 100, 70),
      node('sub-b1', 'subGroup', 'B', 20, 60, 100, 70),
      node('sub-b2', 'subGroup', 'B', 140, 60, 100, 120),
    ];

    const result = equalizeVisibleSubGroupHeightsByDomain(input, 80);

    expect(result.map(item => item.measured?.height)).toEqual([200, 70, 70, 120]);
  });

  it('projects domain height from visible member bottoms and preserves width', () => {
    const input = [
      node('domain-a', 'titleGroup', 'A', 10, 100, 600, 900),
      node('sub-a', 'subGroup', 'A', 30, 190, 200, 180),
      node('child-a', 'default', 'A', 50, 400, 100, 60),
      node('hidden-a', 'default', 'A', 50, 1000, 100, 400, true),
      node('foreign', 'default', 'B', 50, 2000, 100, 400),
    ];

    const result = projectDomainHeightsFromVisibleMembers(input, {
      titleHeight: 40,
      titleVerticalPadding: 10,
      titleSafeGap: 5,
      bottomSafeGap: 20,
      defaultMemberHeight: 80,
    });
    const domain = result.find(item => item.id === 'domain-a');

    expect(domain?.position).toEqual({ x: 10, y: 100 });
    expect(domain?.measured).toEqual({ width: 600, height: 380 });
    expect(input[0].measured?.height).toBe(900);
  });

  it('uses header and bottom padding for an empty domain', () => {
    const result = projectDomainHeightsFromVisibleMembers([
      node('domain', 'titleGroup', 'A', 0, 20, 300, 500),
    ], {
      titleHeight: 40,
      titleVerticalPadding: 10,
      titleSafeGap: 5,
      bottomSafeGap: 20,
      defaultMemberHeight: 80,
    });

    expect(result[0].measured).toEqual({ width: 300, height: 75 });
  });

  it('projects alternate domain-container heights once and can align their left edge', () => {
    const result = projectDomainHeightsFromVisibleMembers([
      node('group-a', 'group', 'A', 300, 20, 400, 500),
      node('title-a', 'titleGroup', 'A', 320, 20, 400, 900),
      node('visible-a', 'default', 'A', 340, 100, 100, 60),
      node('hidden-a', 'default', 'A', 340, 1000, 100, 300, true),
    ], {
      titleHeight: 40,
      titleVerticalPadding: 10,
      titleSafeGap: 5,
      bottomSafeGap: 20,
      defaultMemberHeight: 80,
      containerTypes: new Set(['titleGroup', 'group']),
      left: 80.4,
      extraVerticalPadding: 5,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('group-a')?.position).toEqual({ x: 80, y: 20 });
    expect(byId.get('group-a')?.measured).toEqual({ width: 400, height: 165 });
    expect(byId.get('title-a')?.measured?.height).toBe(900);
  });

  it('sanitizes invalid dimensions without producing non-finite geometry', () => {
    const result = projectDomainHeightsFromVisibleMembers([
      node(
        'domain',
        'titleGroup',
        'A',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NaN,
        -1,
      ),
      node(
        'member',
        'default',
        'A',
        0,
        Number.NaN,
        100,
        Number.NEGATIVE_INFINITY,
      ),
    ], {
      titleHeight: Number.NaN,
      titleVerticalPadding: -10,
      titleSafeGap: Number.POSITIVE_INFINITY,
      bottomSafeGap: -5,
      defaultMemberHeight: Number.NaN,
    });

    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(result[0].measured).toEqual({ width: 0, height: 80 });
  });

  it('projects semantic member right edges and unifies selected container types', () => {
    const result = projectAndUnifySemanticDomainWidths([
      node('domain-a', 'titleGroup', 'A', 100, 0, 200, 300),
      node('sub-a', 'subGroup', 'A', 150, 80, 300, 100),
      node('child-a', 'default', 'A', 500, 100, 100, 60),
      node('domain-b', 'titleGroup', 'B', 40, 400, 700, 350),
      node('child-b', 'default', 'B', 80, 460, 100, 60),
    ], {
      containerTypes: new Set(['titleGroup']),
      horizontalPadding: 20,
      extraRightPadding: 10,
      defaultMemberWidth: 120,
      fallbackContainerHeight: 80,
      preserveCurrentWidth: true,
      ignoreHiddenMembers: true,
    });
    const domains = result.filter(item => item.type === 'titleGroup');

    expect(domains.map(item => item.measured?.width)).toEqual([700, 700]);
    expect(domains.map(item => item.measured?.height)).toEqual([300, 350]);
  });

  it('projects domain bounds, excludes alternate containers, and unifies width', () => {
    const result = projectAndUnifyDomainContainerBounds([
      node('group-a', 'group', 'A', 100, 20, 200, 500),
      node('title-a', 'titleGroup', 'A', 100, 20, 900, 900),
      node('member-a', 'default', 'A', 150, 100, 300, 80),
      node('hidden-a', 'default', 'A', 2000, 2000, 100, 100, true),
      node('domain-b', 'domain', 'B', 100, 300, 100, 100),
      node('member-b', 'default', 'B', 130, 380, 80, 60),
    ], {
      containerTypes: new Set(['titleGroup', 'domain', 'group']),
      horizontalPadding: 20,
      titleHeight: 40,
      titleVerticalPadding: 10,
      titleSafeGap: 5,
      bottomSafeGap: 20,
      defaultMemberWidth: 240,
      defaultMemberHeight: 80,
      fallbackContainerHeight: 80,
      ignoreHiddenMembers: true,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('group-a')?.measured).toEqual({ width: 370, height: 180 });
    expect(byId.get('title-a')?.measured).toEqual({ width: 370, height: 180 });
    expect(byId.get('domain-b')?.measured).toEqual({ width: 370, height: 160 });
  });

  it('sanitizes empty domains and invalid bounds projection inputs', () => {
    const result = projectAndUnifyDomainContainerBounds([
      node(
        'domain',
        'titleGroup',
        'A',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NaN,
        Number.NEGATIVE_INFINITY,
      ),
      node('empty-key', 'titleGroup', '', 10, 10, 50, 50),
      node(
        'member',
        'default',
        'A',
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -10,
      ),
    ], {
      containerTypes: ['titleGroup'],
      horizontalPadding: -10,
      titleHeight: Number.NaN,
      titleVerticalPadding: -1,
      titleSafeGap: Number.POSITIVE_INFINITY,
      bottomSafeGap: -1,
      defaultMemberWidth: Number.NaN,
      defaultMemberHeight: Number.NaN,
      fallbackContainerHeight: Number.NaN,
    });

    expect(result[0].measured).toEqual({ width: 240, height: 80 });
    expect(result[1].measured).toEqual({ width: 240, height: 50 });
    expect(Number.isFinite(result[0].position.x)).toBe(true);
    expect(Number.isFinite(result[0].position.y)).toBe(true);
  });

  it('can ignore hidden semantic members during width projection', () => {
    const result = projectAndUnifySemanticDomainWidths([
      node('domain', 'titleGroup', 'A', 0, 0, 100, 200),
      node('visible', 'default', 'A', 20, 60, 80, 60),
      node('hidden', 'default', 'A', 1000, 60, 100, 60, true),
    ], {
      containerTypes: new Set(['titleGroup']),
      horizontalPadding: 10,
      extraRightPadding: 0,
      defaultMemberWidth: 80,
      fallbackContainerHeight: 80,
      ignoreHiddenMembers: true,
    });

    expect(result[0].measured?.width).toBe(120);
  });

  it('unifies current container widths without moving members', () => {
    const input = [
      node('domain-a', 'titleGroup', 'A', 10, 20, 300, 200),
      node('domain-b', 'titleGroup', 'B', 10, 300, 500, 240),
      node('member', 'default', 'A', 40, 80, 100, 60),
    ];
    const result = unifyContainerWidthsByMaximum(
      input,
      new Set(['titleGroup']),
      80,
    );

    expect(result.slice(0, 2).map(item => item.measured?.width)).toEqual([500, 500]);
    expect(result[0].position).toEqual({ x: 10, y: 20 });
    expect(result[2].position).toEqual({ x: 40, y: 80 });
    expect(input[0].measured?.width).toBe(300);
  });

  it('expands domain width from visible members inside its vertical band', () => {
    const result = expandDomainWidthsFromVisibleVerticalBands([
      node('domain-a', 'titleGroup', 'A', 100, 100, 200, 300),
      node('inside-a', 'default', 'A', 250, 180, 120, 60),
      node('hidden-a', 'default', 'A', 900, 180, 100, 60, true),
      node('below-a', 'default', 'A', 900, 500, 100, 60),
      node('too-left', 'default', 'A', 20, 180, 500, 60),
      node('domain-b', 'titleGroup', 'B', 100, 600, 500, 200),
    ], {
      horizontalPadding: 20,
      leftTolerance: 10,
      fallbackContainerHeight: 80,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-a')?.measured).toEqual({ width: 290, height: 300 });
    expect(byId.get('domain-b')?.measured).toEqual({ width: 500, height: 200 });
  });

  it('sanitizes invalid vertical-band geometry without shrinking domains', () => {
    const result = expandDomainWidthsFromVisibleVerticalBands([
      node(
        'domain',
        'titleGroup',
        'A',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        300,
        Number.NaN,
      ),
      node(
        'member',
        'default',
        'A',
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -10,
      ),
    ], {
      horizontalPadding: -10,
      leftTolerance: Number.NaN,
      fallbackContainerHeight: Number.NaN,
    });

    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(result[0].measured).toEqual({ width: 300, height: 80 });
  });
});
