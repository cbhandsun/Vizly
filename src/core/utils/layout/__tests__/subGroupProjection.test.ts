import { describe, expect, it } from 'vitest';
import {
  finalizeSubGroupHeightsByProjectionPreserveAnchorWithConfig,
  finalizeSubGroupHeightsByProjectionWithConfig,
  finalizeSubGroupWidthsByProjectionPreserveAnchorWithConfig,
  writeSubGroupChildrenRelativeOffsetsWithConfig,
} from '../subGroupProjection';

const config = {
  domain: { padding: { horizontal: 20 } },
  subDomain: {
    padding: { horizontal: 20, top: 40, bottom: 20 },
    title: { height: 30, padding: { vertical: 6 } },
  },
  node: { height: 30 },
};

const layoutConfig = {
  NODE_MIN_WIDTH: 60,
  SUB_GROUP_PADDING: { H: 20, V_TOP: 40, V_BOTTOM: 20 },
};

const child = (id: string, x: number, y: number, width = 60, height = 30) => ({
  id,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data: {},
}) as any;

const subGroup = (children: string[], width = 300, height = 80) => ({
  id: 'subgroup',
  type: 'subGroup',
  position: { x: 100, y: 100 },
  measured: { width, height },
  style: { width, height },
  data: { domain: 'D', children },
}) as any;

describe('subGroupProjection', () => {
  it('projects subgroup height and width from visible child bounds', () => {
    const nodes = [
      subGroup(['a', 'b']),
      child('a', 140, 180),
      child('b', 280, 260),
    ];

    const heightResult = finalizeSubGroupHeightsByProjectionWithConfig(
      nodes,
      layoutConfig,
      config,
    );
    const widthResult = finalizeSubGroupWidthsByProjectionPreserveAnchorWithConfig(
      nodes,
      layoutConfig,
      config,
    );

    expect(heightResult[0]?.measured?.height).toBe(210);
    expect(widthResult[0]?.measured?.width).toBe(240);
    expect(widthResult[0]?.position).toEqual({ x: 100, y: 100 });
  });

  it('restores a bounded dagre size while preserving the subgroup anchor', () => {
    const group = subGroup([]);
    group.data.__dagreSized = { w: 420, h: 260 };

    const [result] = finalizeSubGroupHeightsByProjectionPreserveAnchorWithConfig(
      [group],
      layoutConfig,
      config,
    );

    expect(result.position).toEqual({ x: 100, y: 100 });
    expect(result.measured).toEqual({ width: 420, height: 260 });
  });

  it('writes relative offsets without mutating the input node data', () => {
    const group = subGroup(['a']);
    const inputChild = child('a', 150, 200);
    const originalData = inputChild.data;

    const result = writeSubGroupChildrenRelativeOffsetsWithConfig(
      [group, inputChild],
      layoutConfig,
      config,
    );

    expect(result[1].data.__rel).toEqual({ x: 30, y: 24 });
    expect(inputChild.data).toBe(originalData);
    expect(inputChild.data.__rel).toBeUndefined();
  });

  it('keeps projected dimensions finite for invalid external measurements', () => {
    const group = subGroup(['a'], Number.POSITIVE_INFINITY, Number.NaN);
    const invalidChild = child(
      'a',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      -1,
    );

    const [result] = finalizeSubGroupHeightsByProjectionWithConfig(
      [group, invalidChild],
      { NODE_MIN_WIDTH: Number.POSITIVE_INFINITY },
      { subDomain: { padding: { horizontal: Number.POSITIVE_INFINITY } } },
    );

    expect(Number.isFinite(result.position.x)).toBe(true);
    const projectedWidth = result.measured?.width;
    const projectedHeight = result.measured?.height;
    expect(typeof projectedWidth === 'number' && Number.isFinite(projectedWidth)).toBe(true);
    expect(typeof projectedHeight === 'number' && Number.isFinite(projectedHeight)).toBe(true);
  });
});
