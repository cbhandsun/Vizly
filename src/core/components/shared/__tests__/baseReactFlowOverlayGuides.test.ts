import { describe, expect, it, vi } from 'vitest';

import {
  computeBaseReactFlowAlignGuideLine,
  computeBaseReactFlowRightEdgeGuideLines,
  readBaseReactFlowAlignGuideEnabled,
  readBaseReactFlowRightEdgeGuideFlags,
} from '../baseReactFlowOverlayGuides';

describe('baseReactFlowOverlayGuides', () => {
  it('reads align guide and right-edge guide flags from query and storage', () => {
    expect(readBaseReactFlowAlignGuideEnabled({
      getSearch: () => '?alignGuide=1',
      getStorageItem: () => null,
    })).toBe(true);

    expect(readBaseReactFlowRightEdgeGuideFlags({
      getSearch: () => '',
      getStorageItem: (key) => (key === 'diagram-align-content-max' ? 'true' : null),
    })).toEqual({
      rightLine: false,
      contentLine: true,
    });
  });

  it('falls back safely when guide flag reads throw', () => {
    const onReadFailure = vi.fn();

    expect(readBaseReactFlowAlignGuideEnabled({
      getSearch: () => {
        throw new Error('boom');
      },
      getStorageItem: () => null,
      onReadFailure,
    })).toBe(false);

    expect(readBaseReactFlowRightEdgeGuideFlags({
      getSearch: () => '',
      getStorageItem: () => {
        throw new Error('boom');
      },
      onReadFailure,
    })).toEqual({
      rightLine: false,
      contentLine: false,
    });

    expect(onReadFailure).toHaveBeenCalledTimes(2);
  });

  it('computes align guide geometry from title groups and node bounds', () => {
    const guide = computeBaseReactFlowAlignGuideLine([
      {
        id: 'tg-1',
        type: 'titleGroup',
        position: { x: 100, y: 20 },
        measured: { height: 30 },
      },
      {
        id: 'node-1',
        type: 'task',
        position: { x: 160, y: 200 },
        measured: { height: 80 },
      },
    ]);

    expect(guide).toEqual({
      x: 100,
      y: 20,
      height: 260,
    });
  });

  it('computes right-edge and content-max guide lines per domain', () => {
    const overlays = computeBaseReactFlowRightEdgeGuideLines({
      nodes: [
        {
          id: 'tg-1',
          type: 'titleGroup',
          position: { x: 100, y: 10 },
          measured: { width: 240, height: 50 },
          data: { domain: 'alpha' },
        },
        {
          id: 'node-1',
          type: 'task',
          position: { x: 140, y: 60 },
          measured: { width: 100, height: 50 },
          data: { domain: 'alpha' },
        },
        {
          id: 'node-2',
          type: 'task',
          position: { x: 260, y: 150 },
          measured: { width: 120, height: 70 },
          data: { domain: 'alpha' },
        },
      ],
      flags: { rightLine: true, contentLine: true },
    });

    expect(overlays).toEqual([
      {
        key: 'edge-right-tg-1',
        kind: 'right',
        x: 340,
        y: 60,
        height: 160,
      },
      {
        key: 'edge-content-tg-1',
        kind: 'content',
        x: 380,
        y: 60,
        height: 160,
      },
    ]);
  });
});
